import "server-only";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { logError } from "@/lib/log";

// Bookings we've sent to Lodgify can be cancelled or changed there. Our site
// takes the balance itself, so it must notice before charging a guest for a
// stay that no longer exists. A difference is flagged for the owner, never
// acted on automatically: cancelling or refunding is their decision.

export type LodgifyMismatch = { mismatch: "CANCELLED" | "CHANGED"; detail: string } | null;

type Ours = { checkIn: string; checkOut: string; lodgifyPropertyId: number | null };

type LodgifyBooking = {
  status?: unknown;
  is_deleted?: unknown;
  canceled_at?: unknown;
  arrival?: unknown;
  departure?: unknown;
  property_id?: unknown;
};

/** How Lodgify's copy differs from ours, if it does. `null` booking means Lodgify no longer has it. */
export function compareWithLodgify(ours: Ours, theirs: LodgifyBooking | null): LodgifyMismatch {
  if (!theirs || theirs.is_deleted === true) return { mismatch: "CANCELLED", detail: "Deleted in Lodgify." };
  const status = typeof theirs.status === "string" ? theirs.status : "";
  if (theirs.canceled_at || status === "Declined" || status === "Cancelled" || status === "Canceled") {
    return { mismatch: "CANCELLED", detail: `Lodgify shows it as ${status === "Booked" || !status ? "cancelled" : status.toLowerCase()}.` };
  }
  const arrival = String(theirs.arrival ?? "").slice(0, 10);
  const departure = String(theirs.departure ?? "").slice(0, 10);
  const changes: string[] = [];
  if (arrival !== ours.checkIn || departure !== ours.checkOut) {
    changes.push(`dates in Lodgify are ${arrival} to ${departure} (here ${ours.checkIn} to ${ours.checkOut})`);
  }
  if (ours.lodgifyPropertyId && Number(theirs.property_id) !== Number(ours.lodgifyPropertyId)) {
    changes.push("it's on a different property in Lodgify");
  }
  if (changes.length) return { mismatch: "CHANGED", detail: `Changed in Lodgify: ${changes.join("; ")}.` };
  return null;
}

/**
 * Compares one booking with Lodgify and records the result. Returns false if
 * Lodgify couldn't be asked, so nothing is known.
 */
export async function checkLodgifyBooking(reservationId: string): Promise<boolean> {
  const sql = db();
  const apiKey = process.env.LODGIFY_API_KEY;
  if (!apiKey) return false;
  const [r] = await sql<(Ours & { reference: string; lodgifyBookingId: number; lodgifyMismatch: string | null })[]>`
    SELECT r.reference, r.check_in::text, r.check_out::text, r.lodgify_booking_id, r.lodgify_mismatch, p.lodgify_property_id
    FROM reservations r JOIN properties p ON p.id = r.property_id
    WHERE r.id = ${reservationId} AND r.status = 'CONFIRMED' AND r.lodgify_booking_id IS NOT NULL
  `;
  if (!r) return false;

  let theirs: LodgifyBooking | null;
  try {
    const res = await fetch(`https://api.lodgify.com/v2/reservations/bookings/${r.lodgifyBookingId}`, {
      headers: { "X-ApiKey": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404) theirs = null;
    else if (!res.ok) throw new Error(`Lodgify returned HTTP ${res.status}`);
    else theirs = (await res.json()) as LodgifyBooking;
  } catch (error) {
    logError("Lodgify booking check failed", error);
    return false;
  }

  const found = compareWithLodgify(r, theirs);
  await sql.begin(async (tx) => {
    // Once the owner has chosen to keep the booking, differences aren't flagged again.
    await tx`
      UPDATE reservations SET lodgify_checked_at = now(),
        lodgify_mismatch = CASE WHEN lodgify_mismatch_ignored THEN lodgify_mismatch ELSE ${found?.mismatch ?? null} END,
        lodgify_mismatch_detail = CASE WHEN lodgify_mismatch_ignored THEN lodgify_mismatch_detail ELSE ${found?.detail ?? null} END
      WHERE id = ${reservationId}
    `;
    if (found && found.mismatch !== r.lodgifyMismatch) {
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: "lodgify.booking_differs",
        entityType: "reservation",
        entityId: reservationId,
        details: { reference: r.reference, lodgifyBookingId: r.lodgifyBookingId, ...found },
      });
    }
  });
  return true;
}

/** Checks the upcoming bookings least recently compared with Lodgify (each about every 6 hours). */
export async function checkLodgifyBookings(limit = 10) {
  if (!process.env.LODGIFY_API_KEY) return { checked: 0 };
  const due = await db()<{ id: string }[]>`
    SELECT id FROM reservations
    WHERE status = 'CONFIRMED' AND lodgify_booking_id IS NOT NULL AND check_out >= current_date
      AND (lodgify_checked_at IS NULL OR lodgify_checked_at < now() - interval '6 hours')
    ORDER BY lodgify_checked_at NULLS FIRST
    LIMIT ${limit}
  `;
  let checked = 0;
  for (const { id } of due) if (await checkLodgifyBooking(id)) checked++;
  return { checked };
}

/**
 * Whether a balance can be charged as far as Lodgify is concerned: checked
 * just now, or within the last day if Lodgify can't be reached, and no
 * difference the owner hasn't dealt with.
 */
export async function lodgifyAllowsBalanceCharge(reservationId: string): Promise<boolean> {
  const [linked] = await db()<{ id: string }[]>`
    SELECT id FROM reservations WHERE id = ${reservationId} AND lodgify_booking_id IS NOT NULL
  `;
  if (!linked) return true;
  await checkLodgifyBooking(reservationId);
  const [r] = await db()<{ ok: boolean }[]>`
    SELECT (lodgify_mismatch IS NULL OR lodgify_mismatch_ignored)
       AND lodgify_checked_at > now() - interval '24 hours' AS ok
    FROM reservations WHERE id = ${reservationId}
  `;
  return Boolean(r?.ok);
}

/** The owner keeps a booking Lodgify shows differently: its balance is charged as normal. */
export async function keepDespiteLodgify(reservationId: string, actor: string) {
  return db().begin(async (tx) => {
    const [r] = await tx<{ reference: string; detail: string | null }[]>`
      UPDATE reservations SET lodgify_mismatch_ignored = true
      WHERE id = ${reservationId} AND lodgify_mismatch IS NOT NULL AND NOT lodgify_mismatch_ignored
      RETURNING reference, lodgify_mismatch_detail AS detail
    `;
    if (!r) return false;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor,
      action: "lodgify.difference_accepted",
      entityType: "reservation",
      entityId: reservationId,
      details: { reference: r.reference, detail: r.detail },
    });
    return true;
  });
}
