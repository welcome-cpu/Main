import "server-only";
import { recordAudit } from "@/lib/audit";
import { isLodgifyPushEnabled } from "@/lib/booking/lodgify-push";
import { db } from "@/lib/db/client";
import { logError } from "@/lib/log";

export type LodgifyCancelOutcome = "DONE" | "FAILED" | "NOT_SENT" | null;

/**
 * Releases a cancelled booking in Lodgify, which passes the free dates on to
 * the channels. Lodgify's "decline" keeps the booking on record there, unlike
 * deleting it. Anything other than a clear yes is left for the owner to see:
 * dates still held in Lodgify can't be sold on the channels.
 */
export async function cancelBookingInLodgify(reservationId: string): Promise<LodgifyCancelOutcome> {
  const sql = db();
  const [r] = await sql<{ reference: string; propertyId: string; lodgifyBookingId: number | null; lodgifyPushStatus: string | null; lodgifyMismatch: string | null }[]>`
    SELECT reference, property_id, lodgify_booking_id, lodgify_push_status, lodgify_mismatch
    FROM reservations WHERE id = ${reservationId} AND status = 'CANCELLED'
  `;
  if (!r) return null;

  const finish = async (status: Exclude<LodgifyCancelOutcome, null>, error: string | null) => {
    await sql.begin(async (tx) => {
      await tx`UPDATE reservations SET lodgify_cancel_status = ${status}, lodgify_cancel_error = ${error} WHERE id = ${reservationId}`;
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: `lodgify.cancel_${status.toLowerCase()}`,
        entityType: "reservation",
        entityId: reservationId,
        propertyId: r.propertyId,
        details: { reference: r.reference, lodgifyBookingId: r.lodgifyBookingId, error },
      });
    });
    return status;
  };

  if (!r.lodgifyBookingId) {
    // Never sent, or definitely refused: there's nothing there to release.
    if (r.lodgifyPushStatus !== "CHECK" && r.lodgifyPushStatus !== "SENDING") return null;
    return finish("NOT_SENT", "It isn't clear whether this booking reached Lodgify. Check there, and cancel it if it did.");
  }
  if (r.lodgifyMismatch === "CANCELLED") return finish("DONE", null);

  const apiKey = process.env.LODGIFY_API_KEY;
  if (!isLodgifyPushEnabled() || !apiKey) {
    return finish("NOT_SENT", `Sending to Lodgify is off here. Cancel booking ${r.lodgifyBookingId} in Lodgify.`);
  }

  try {
    const res = await fetch(`https://api.lodgify.com/v1/reservation/booking/${r.lodgifyBookingId}/decline`, {
      method: "PUT",
      headers: { "X-ApiKey": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    // Not found means it's already gone from Lodgify, so the dates are free there.
    if (res.ok || res.status === 404) return finish("DONE", null);
    return finish("FAILED", `Lodgify refused (HTTP ${res.status}). Cancel booking ${r.lodgifyBookingId} in Lodgify.`);
  } catch (error) {
    logError("Lodgify cancellation failed", error);
    return finish("FAILED", `No clear answer from Lodgify. Check booking ${r.lodgifyBookingId} there, and cancel it if needed.`);
  }
}
