import "server-only";
import type { Sql, Tx } from "@/lib/db/client";

/**
 * Marks a reservation's voucher payment as cancelled, in the same
 * transaction that releases the hold. lib/vouchers/redemption.ts then gives
 * the amount back to the voucher at Gift Up, and a late card payment for
 * the hold is refused rather than confirmed without the voucher.
 */
export async function cancelHoldVoucher(sql: Sql | Tx, reservationId: string) {
  await sql`
    UPDATE payments SET status = 'CANCELLED', cancelled_at = now()
    WHERE reservation_id = ${reservationId} AND kind = 'VOUCHER' AND status IN ('PENDING', 'AUTHORISED')
  `;
}
