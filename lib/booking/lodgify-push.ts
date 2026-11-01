import "server-only";
import { recordAudit } from "@/lib/audit";
import type { Sql, Tx } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { logError } from "@/lib/log";
import { formatPence } from "@/lib/money";
import type { Quote } from "@/lib/pricing/quote";
import { SITE_URL } from "@/lib/site";

// Direct bookings are created in Lodgify once their first payment is taken,
// so Lodgify can send its guest emails and show them with the channel
// bookings. Our site keeps taking the payments: Lodgify's API can't record
// a payment, so each booking gets an admin note saying what's paid and that
// the website collects the balance. (Lodgify drops "Comment" messages sent
// with a new booking, so the note is set on the booking afterwards.)
//
// A booking must never be created in Lodgify twice, so only a definite
// refusal (FAILED) or an unclear answer (CHECK) stops here; neither is retried
// automatically.

/** Sending to Lodgify is off unless LODGIFY_BOOKING_PUSH=on for the deployment. */
export function isLodgifyPushEnabled() {
  return process.env.LODGIFY_BOOKING_PUSH === "on" && Boolean(process.env.LODGIFY_API_KEY);
}

/** Marks a just-paid booking to be sent to Lodgify (or recorded as not sent). */
export async function queueLodgifyPush(sql: Sql | Tx, reservationId: string) {
  await sql`
    UPDATE reservations SET lodgify_push_status = ${isLodgifyPushEnabled() ? "PENDING" : "OFF"}
    WHERE id = ${reservationId} AND source = 'DIRECT' AND lodgify_push_status IS NULL
  `;
}

export type LodgifyPushRow = {
  id: string;
  reference: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  guestMessage: string | null;
  totalPence: number;
  currency: string;
  balanceDueDate: string | null;
  quote: Quote;
  lodgifyPropertyId: number | null;
  lodgifyRoomTypeId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  country: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  cardPaidPence: number;
  voucherPaidPence: number;
  voucherCode: string | null;
};

/** The note for the owner in Lodgify: where the booking came from and what's been paid. */
export function lodgifyNote(r: LodgifyPushRow) {
  const money = (pence: number) => formatPence(pence, r.currency);
  const balance = r.totalPence - r.cardPaidPence - r.voucherPaidPence;
  const lines = [
    `Booked on ${SITE_URL.replace(/^https?:\/\//, "")}, reference ${r.reference}.`,
    `Total ${money(r.totalPence)}.`,
    `Paid on the website: ${money(r.cardPaidPence)} by card${r.voucherPaidPence > 0 ? `, ${money(r.voucherPaidPence)} by gift voucher ${r.voucherCode ?? ""}`.trimEnd() : ""}.`,
    balance > 0
      ? `Balance ${money(balance)}${r.balanceDueDate ? ` due ${r.balanceDueDate}` : ""}: the website charges the guest's card automatically. Don't request payment in Lodgify.`
      : "Paid in full. Don't request payment in Lodgify.",
  ];
  if (r.pets > 0) lines.push(`Pets: ${r.pets}.`);
  if (r.quote.extras.length > 0) {
    lines.push(`Extras: ${r.quote.extras.map((x) => `${x.name}${x.quantity > 1 ? ` × ${x.quantity}` : ""}`).join(", ")}.`);
  }
  if (r.quote.discount) lines.push(`Discount code ${r.quote.discount.code}: −${money(r.quote.discount.pence)}.`);
  return lines.join("\n");
}

/** The body for Lodgify's POST /v1/reservation/booking. */
export function lodgifyBookingBody(r: LodgifyPushRow) {
  const messages = r.guestMessage ? [{ subject: "Message from the guest", message: r.guestMessage, type: "Renter" }] : [];
  return {
    property_id: r.lodgifyPropertyId,
    arrival: r.checkIn,
    departure: r.checkOut,
    status: "Booked",
    bookability: "InstantBooking",
    source_text: `Gamrie Chalets website (${r.reference})`,
    total: r.totalPence / 100,
    currency_code: r.currency,
    rooms: [
      {
        room_type_id: r.lodgifyRoomTypeId,
        guest_breakdown: { adults: r.adults, children: r.children, infants: r.infants, pets: r.pets },
      },
    ],
    guest: {
      guest_name: { first_name: r.firstName, last_name: r.lastName },
      email: r.email,
      phone: r.phone,
      street_address1: r.addressLine1,
      street_address2: r.addressLine2,
      city: r.city,
      postal_code: r.postalCode,
      country_code: r.country,
    },
    messages,
  };
}

/** Lodgify answers a created booking with its ID as a bare number. */
export function parseLodgifyBookingId(text: string): number | null {
  const parsed: unknown = JSON.parse(text);
  const id = typeof parsed === "number" ? parsed : Number((parsed as { id?: unknown })?.id);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

type PushOutcome = "PUSHED" | "FAILED" | "CHECK" | "SKIPPED";

/** Sends one booking to Lodgify, if it's waiting to be sent. */
export async function pushReservationToLodgify(reservationId: string): Promise<PushOutcome> {
  const sql = db();
  // Claiming the row first means two runs can never both send it.
  const [claimed] = await sql<{ id: string }[]>`
    UPDATE reservations SET lodgify_push_status = 'SENDING', lodgify_push_started_at = now(), lodgify_push_error = NULL
    WHERE id = ${reservationId} AND lodgify_push_status = 'PENDING' AND status = 'CONFIRMED'
    RETURNING id
  `;
  if (!claimed) return "SKIPPED";

  const [row] = await sql<LodgifyPushRow[]>`
    SELECT r.id, r.reference, r.check_in::text, r.check_out::text, r.adults, r.children, r.infants, r.pets,
           r.guest_message, r.total_pence, r.currency, r.balance_due_date::text, r.price_breakdown AS quote,
           p.lodgify_property_id, p.lodgify_room_type_id,
           g.first_name, g.last_name, g.email, g.phone, g.country,
           g.address_line1, g.address_line2, g.city, g.postal_code,
           COALESCE(SUM(pay.amount_pence) FILTER (WHERE pay.status = 'SUCCEEDED' AND pay.kind <> 'VOUCHER'), 0)::int AS card_paid_pence,
           COALESCE(SUM(pay.amount_pence) FILTER (WHERE pay.status = 'SUCCEEDED' AND pay.kind = 'VOUCHER'), 0)::int AS voucher_paid_pence,
           max(pay.voucher_code) FILTER (WHERE pay.kind = 'VOUCHER') AS voucher_code
    FROM reservations r
    JOIN properties p ON p.id = r.property_id
    JOIN guests g ON g.id = r.guest_id
    LEFT JOIN payments pay ON pay.reservation_id = r.id
    WHERE r.id = ${reservationId}
    GROUP BY r.id, p.id, g.id
  `;

  const finish = async (status: Exclude<PushOutcome, "SKIPPED">, error: string | null, lodgifyId: number | null = null) => {
    await sql.begin(async (tx) => {
      await tx`
        UPDATE reservations SET lodgify_push_status = ${status}, lodgify_push_error = ${error?.slice(0, 1000) ?? null},
          lodgify_booking_id = COALESCE(${lodgifyId}, lodgify_booking_id),
          lodgify_pushed_at = ${status === "PUSHED" ? tx`now()` : tx`lodgify_pushed_at`}
        WHERE id = ${reservationId}
      `;
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: status === "PUSHED" ? "lodgify.booking_created" : "lodgify.booking_not_created",
        entityType: "reservation",
        entityId: reservationId,
        details: { reference: row?.reference, status, lodgifyBookingId: lodgifyId, error },
      });
    });
    return status;
  };

  if (!row?.lodgifyPropertyId || !row.lodgifyRoomTypeId) {
    return finish("FAILED", "This chalet has no Lodgify property or room type ID.");
  }
  const apiKey = process.env.LODGIFY_API_KEY;
  if (!apiKey || !isLodgifyPushEnabled()) {
    // Switched off since it was queued: put it back to wait.
    await sql`UPDATE reservations SET lodgify_push_status = 'PENDING' WHERE id = ${reservationId} AND lodgify_push_status = 'SENDING'`;
    return "SKIPPED";
  }

  let res: Response;
  let text: string;
  try {
    res = await fetch("https://api.lodgify.com/v1/reservation/booking", {
      method: "POST",
      headers: { "X-ApiKey": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(lodgifyBookingBody(row)),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    text = await res.text();
  } catch (error) {
    logError("Lodgify booking push got no answer", error);
    return finish("CHECK", "Lodgify didn't answer, so the booking may or may not have been created there.");
  }

  if (res.ok) {
    let id: number | null = null;
    try {
      id = parseLodgifyBookingId(text);
    } catch {}
    if (!id) return finish("CHECK", `Lodgify accepted the booking but didn't give its ID (HTTP ${res.status}).`);
    // The booking exists now; a missing note is worth flagging, not resending for.
    const noted = await addLodgifyNote(apiKey, id, lodgifyNote(row));
    return finish("PUSHED", noted ? null : "Created in Lodgify, but the payment note couldn't be added. Add it there by hand.", id);
  }
  if (res.status >= 500) {
    return finish("CHECK", `Lodgify had an error (HTTP ${res.status}), so the booking may or may not have been created there.`);
  }
  let message = "";
  try {
    const body = JSON.parse(text) as { message?: unknown; code?: unknown };
    message = [body.code, body.message].filter((x) => typeof x === "string").join(": ");
  } catch {}
  return finish("FAILED", `Lodgify refused the booking (HTTP ${res.status})${message ? `: ${message.slice(0, 300)}` : "."}`);
}

/** Sets the booking's admin note in Lodgify. True if Lodgify accepted it. */
async function addLodgifyNote(apiKey: string, lodgifyBookingId: number, note: string) {
  try {
    const res = await fetch(`https://api.lodgify.com/v1/reservation/booking/${lodgifyBookingId}`, {
      method: "PUT",
      headers: { "X-ApiKey": apiKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ id: lodgifyBookingId, note }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    return res.ok;
  } catch (error) {
    logError("Lodgify booking note failed", error);
    return false;
  }
}

/**
 * Sends every booking waiting for Lodgify. A send that stopped part-way
 * (the server was stopped mid-request) is marked CHECK, not resent.
 */
export async function pushPendingLodgifyBookings(limit = 10) {
  const sql = db();
  await sql`
    UPDATE reservations SET lodgify_push_status = 'CHECK',
      lodgify_push_error = 'Sending to Lodgify was interrupted, so the booking may or may not have been created there.'
    WHERE lodgify_push_status = 'SENDING' AND lodgify_push_started_at < now() - interval '5 minutes'
  `;
  if (!isLodgifyPushEnabled()) return { pushed: 0, failed: 0 };
  const pending = await sql<{ id: string }[]>`
    SELECT id FROM reservations WHERE lodgify_push_status = 'PENDING' AND status = 'CONFIRMED'
    ORDER BY confirmed_at LIMIT ${limit}
  `;
  let pushed = 0;
  let failed = 0;
  for (const { id } of pending) {
    const outcome = await pushReservationToLodgify(id);
    if (outcome === "PUSHED") pushed++;
    else if (outcome !== "SKIPPED") failed++;
  }
  return { pushed, failed };
}

/**
 * The owner's retry, after checking the booking isn't in Lodgify already.
 * Or, if it is, records its Lodgify ID instead of creating it again.
 */
export async function resolveLodgifyPush(
  reservationId: string,
  actor: string,
  action: { retry: true } | { lodgifyBookingId: number }
) {
  return db().begin(async (tx) => {
    const [r] = await tx<{ reference: string }[]>`
      UPDATE reservations SET
        lodgify_push_status = ${"retry" in action ? "PENDING" : "PUSHED"},
        lodgify_booking_id = ${"retry" in action ? null : action.lodgifyBookingId},
        lodgify_pushed_at = ${"retry" in action ? null : tx`now()`},
        lodgify_push_error = NULL
      WHERE id = ${reservationId} AND status = 'CONFIRMED' AND lodgify_push_status IN ('OFF', 'FAILED', 'CHECK')
      RETURNING reference
    `;
    if (!r) return false;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor,
      action: "retry" in action ? "lodgify.push_retried" : "lodgify.booking_linked",
      entityType: "reservation",
      entityId: reservationId,
      details: { reference: r.reference, ...("retry" in action ? {} : { lodgifyBookingId: action.lodgifyBookingId }) },
    });
    return true;
  });
}
