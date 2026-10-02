import "server-only";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { recordAudit } from "@/lib/audit";
import type { Reason } from "@/lib/booking/availability-rules";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import { db, type Tx } from "@/lib/db/client";
import type { Quote, QuoteError } from "@/lib/pricing/quote";
import { quoteStay, type StayQuoteRequest } from "@/lib/pricing/quote-service";

/**
 * How long a checkout hold lasts. Guests are told 30 minutes, and the Stripe
 * checkout (Phase 9) expires at 30; the extra 5 minutes absorb the delay
 * between paying and Stripe telling us, so a just-in-time payment still
 * finds its hold.
 */
export const HOLD_MINUTES = 35;
export const GUEST_FACING_HOLD_MINUTES = 30;

export type GuestDetails = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string | null;
  message: string | null;
};

export type HoldResult =
  | {
      ok: true;
      reservationId: string;
      reference: string;
      /** Give this to the guest's browser only. Never stored in plain form. */
      accessToken: string;
      expiresAt: Date;
      quote: Quote;
    }
  | { ok: false; reasons: Reason[]; quoteError?: QuoteError };

const REFERENCE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

export function generateReference() {
  let s = "GC-";
  for (let i = 0; i < 6; i++) s += REFERENCE_ALPHABET[randomInt(32)];
  return s;
}

export function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest();
}

/** Marks a property's lapsed holds as EXPIRED. Call with the property locked. */
export async function expireStaleHolds(tx: Tx, propertyId?: string) {
  const expired = await tx<{ id: string; propertyId: string; reference: string }[]>`
    UPDATE reservations SET status = 'EXPIRED'
    WHERE status = 'HOLD' AND hold_expires_at <= now()
      ${propertyId ? tx`AND property_id = ${propertyId}` : tx``}
    RETURNING id, property_id, reference
  `;
  for (const r of expired) {
    await recordAudit(tx, {
      actorType: "SYSTEM",
      action: "reservation.hold_expired",
      entityType: "reservation",
      entityId: r.id,
      propertyId: r.propertyId,
      details: { reference: r.reference },
    });
  }
  return expired.length;
}

/** Expires lapsed holds across all properties (scheduled job). */
export async function expireAllStaleHolds() {
  return db().begin((tx) => expireStaleHolds(tx));
}

/**
 * Creates a short-lived hold on a stay so the guest can pay. Inside one
 * transaction holding the property's availability lock it:
 *   1. expires lapsed holds,
 *   2. re-checks availability and re-prices the stay on the server,
 *   3. inserts the hold with the server's price snapshot.
 * Two guests racing for the same dates are serialised by the lock; the
 * database exclusion constraint is a final backstop. The browser never
 * supplies a price.
 */
export async function createHold(
  propertyId: string,
  stay: StayQuoteRequest,
  guest: GuestDetails,
  meta: { ip: string | null }
): Promise<HoldResult> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db().begin((tx) => createHoldInTransaction(tx, propertyId, stay, guest, meta));
    } catch (error) {
      const e = error as { code?: string; constraint_name?: string };
      // Two holds for the same nights: the exclusion constraint caught what
      // the lock should already have prevented. Report as unavailable.
      if (e.code === "23P01") {
        return { ok: false, reasons: [{ code: "DATES_TAKEN", message: "Those dates have just been booked." }] };
      }
      // A booking reference collision (vanishingly rare): try again.
      if (e.code === "23505" && e.constraint_name === "reservations_reference_key") continue;
      throw error;
    }
  }
  throw new Error("Couldn't generate a unique booking reference.");
}

async function createHoldInTransaction(
  tx: Tx,
  propertyId: string,
  stay: StayQuoteRequest,
  guest: GuestDetails,
  meta: { ip: string | null }
): Promise<HoldResult> {
  await lockPropertyAvailability(tx, propertyId);
  await expireStaleHolds(tx, propertyId);

  const quoted = await quoteStay(tx, propertyId, stay);
  if (!quoted) return { ok: false, reasons: [{ code: "PROPERTY_NOT_BOOKABLE", message: "This property can't be booked." }] };
  if (!quoted.availability.available) return { ok: false, reasons: quoted.availability.reasons };
  if (!quoted.pricing?.ok) {
    return { ok: false, reasons: [], quoteError: quoted.pricing?.error };
  }
  const quote = quoted.pricing.quote;

  const [property] = await tx<{ turnoverNights: number; currency: string }[]>`
    SELECT turnover_nights, currency FROM properties WHERE id = ${propertyId}
  `;
  const [guestRow] = await tx<{ id: string }[]>`
    INSERT INTO guests (first_name, last_name, email, phone, country)
    VALUES (${guest.firstName}, ${guest.lastName}, ${guest.email}, ${guest.phone}, ${guest.country})
    RETURNING id
  `;

  const accessToken = randomBytes(32).toString("base64url");
  const reference = generateReference();
  const [reservation] = await tx<{ id: string; holdExpiresAt: Date }[]>`
    INSERT INTO reservations (
      reference, property_id, source, status, check_in, check_out, turnover_nights,
      adults, children, infants, pets, guest_id, guest_message, hold_expires_at,
      currency, accommodation_pence, cleaning_fee_pence, pet_fee_pence, extras_pence,
      discount_pence, total_pence, deposit_pence, balance_due_date, price_breakdown,
      discount_code_id, created_by, access_token_sha256, terms_accepted_at
    ) VALUES (
      ${reference}, ${propertyId}, 'DIRECT', 'HOLD', ${stay.checkIn}, ${stay.checkOut}, ${property.turnoverNights},
      ${stay.adults}, ${stay.children}, ${stay.infants}, ${stay.pets}, ${guestRow.id}, ${guest.message},
      now() + make_interval(mins => ${HOLD_MINUTES}),
      ${quote.currency}, ${quote.accommodationPence}, ${quote.cleaningFeePence}, ${quote.petFeePence},
      ${quote.extrasPence}, ${quote.discount?.pence ?? 0}, ${quote.totalPence}, ${quote.dueNowPence},
      ${quote.balanceDueDate}, ${tx.json(quote as unknown as Parameters<Tx["json"]>[0])},
      ${quote.discount?.id ?? null}, 'guest', ${hashAccessToken(accessToken)}, now()
    )
    RETURNING id, hold_expires_at
  `;

  for (const x of quote.extras) {
    await tx`
      INSERT INTO reservation_extras (reservation_id, extra_id, name, pricing_type, unit_price_pence, quantity, total_pence)
      VALUES (${reservation.id}, ${x.extraId}, ${x.name}, ${x.pricingType}, ${x.unitPricePence}, ${x.quantity}, ${x.totalPence})
    `;
  }

  await recordAudit(tx, {
    actorType: "GUEST",
    actor: guest.email,
    action: "reservation.hold_created",
    entityType: "reservation",
    entityId: reservation.id,
    propertyId,
    details: {
      reference,
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      totalPence: quote.totalPence,
      dueNowPence: quote.dueNowPence,
      ip: meta.ip,
    },
  });

  return {
    ok: true,
    reservationId: reservation.id,
    reference,
    accessToken,
    expiresAt: reservation.holdExpiresAt,
    quote,
  };
}

export type GuestHoldView = {
  reservationId: string;
  reference: string;
  propertySlug: string;
  propertyName: string;
  status: "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  checkIn: string;
  checkOut: string;
  /** When the guest-facing 30 minutes run out. */
  payBy: Date | null;
  quote: Quote;
};

/** A hold or booking, for the guest holding its access token only. */
export async function getHoldForGuest(reservationId: string, accessToken: string): Promise<GuestHoldView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(reservationId) || !/^[A-Za-z0-9_-]{43}$/.test(accessToken)) return null;
  const [row] = await db()<(Omit<GuestHoldView, "status" | "payBy"> & { status: string; holdExpiresAt: Date | null; live: boolean })[]>`
    SELECT r.id AS reservation_id, r.reference, p.slug AS property_slug, p.name AS property_name,
           r.status, r.check_in, r.check_out, r.hold_expires_at, r.price_breakdown AS quote,
           (r.status = 'HOLD' AND r.hold_expires_at > now()) AS live
    FROM reservations r JOIN properties p ON p.id = r.property_id
    WHERE r.id = ${reservationId} AND r.access_token_sha256 = ${hashAccessToken(accessToken)}
  `;
  if (!row) return null;
  const { holdExpiresAt, live, ...rest } = row;
  return {
    ...rest,
    // A lapsed hold that hasn't been swept yet is reported as expired.
    status: row.status === "HOLD" && !live ? "EXPIRED" : (row.status as GuestHoldView["status"]),
    payBy:
      row.status === "HOLD" && holdExpiresAt
        ? new Date(new Date(holdExpiresAt).getTime() - (HOLD_MINUTES - GUEST_FACING_HOLD_MINUTES) * 60_000)
        : null,
  };
}

/** Lets a guest give up their hold (e.g. to change dates). */
export async function releaseHold(reservationId: string, accessToken: string): Promise<boolean> {
  const view = await getHoldForGuest(reservationId, accessToken);
  if (!view || view.status !== "HOLD") return false;
  return db().begin(async (tx) => {
    const [row] = await tx<{ propertyId: string }[]>`
      UPDATE reservations SET status = 'EXPIRED'
      WHERE id = ${reservationId} AND status = 'HOLD'
      RETURNING property_id
    `;
    if (!row) return false;
    await recordAudit(tx, {
      actorType: "GUEST",
      action: "reservation.hold_released",
      entityType: "reservation",
      entityId: reservationId,
      propertyId: row.propertyId,
      details: { reference: view.reference },
    });
    return true;
  });
}
