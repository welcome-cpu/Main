import "server-only";
import { recordAudit } from "@/lib/audit";
import { queueAfterFirstPayment } from "@/lib/booking/after-payment";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import { db } from "@/lib/db/client";
import { enqueueBookingConfirmedEmails } from "@/lib/email/booking-emails";
import { logError } from "@/lib/log";
import { cancelHoldVoucher } from "@/lib/vouchers/cancel";
import { redeemVoucher, undoVoucherRedemption } from "@/lib/vouchers/giftup";

// How a voucher payment moves through its states is described in
// db/migrations/0010_gift_vouchers.sql.

/** A hold's Stripe checkout can still complete a few minutes after the hold lapses. */
const LATE_PAYMENT_GRACE_MINUTES = 10;

export type HoldVoucherOutcome = { ok: true } | { ok: false; message: string };

/**
 * Takes the voucher amount for a fresh hold from Gift Up. Called after the
 * hold has committed, so dates are already reserved and the availability
 * lock isn't held during the call. If Gift Up refuses, or doesn't answer
 * clearly, the hold is released and the guest isn't sent on to pay.
 */
export async function redeemHoldVoucher(hold: { reservationId: string; reference: string }): Promise<HoldVoucherOutcome> {
  const sql = db();
  const [payment] = await sql<{ id: string; voucherCode: string; amountPence: number; propertyId: string }[]>`
    SELECT pay.id, pay.voucher_code, pay.amount_pence, r.property_id
    FROM payments pay JOIN reservations r ON r.id = pay.reservation_id
    WHERE pay.reservation_id = ${hold.reservationId} AND pay.kind = 'VOUCHER' AND pay.status = 'PENDING'
  `;
  if (!payment) return { ok: true };

  const result = await redeemVoucher(payment.voucherCode, payment.amountPence, hold);
  if (result.ok) {
    // Keep the transaction ID whatever happened meanwhile: if the hold was
    // released during the call, the payment is already CANCELLED and the
    // reversal job needs the ID to give the amount back.
    const still = await sql.begin(async (tx) => {
      const [row] = await tx<{ status: string }[]>`
        UPDATE payments SET giftup_transaction_id = ${result.transactionId},
          status = CASE WHEN status = 'PENDING' THEN 'AUTHORISED' ELSE status END,
          authorised_at = CASE WHEN status = 'PENDING' THEN now() ELSE authorised_at END
        WHERE id = ${payment.id}
        RETURNING status
      `;
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: "voucher.redeemed",
        entityType: "payment",
        entityId: payment.id,
        propertyId: payment.propertyId,
        details: { reference: hold.reference, amountPence: payment.amountPence, transactionId: result.transactionId },
      });
      return row?.status === "AUTHORISED";
    });
    if (!still) {
      await reverseAbandonedVouchers();
      return { ok: false, message: "Your hold on these dates was released, so your gift voucher hasn't been used." };
    }
    return { ok: true };
  }

  await sql.begin(async (tx) => {
    await tx`
      UPDATE payments SET status = 'FAILED', failed_at = now(),
        failure_code = ${result.outcome === "UNKNOWN" ? "giftup_unknown" : "giftup_refused"},
        failure_message = ${result.message.slice(0, 300)}
      WHERE id = ${payment.id} AND status = 'PENDING'
    `;
    await tx`UPDATE reservations SET status = 'EXPIRED' WHERE id = ${hold.reservationId} AND status = 'HOLD'`;
    await recordAudit(tx, {
      actorType: "SYSTEM",
      action: result.outcome === "UNKNOWN" ? "voucher.redemption_unknown" : "voucher.refused",
      entityType: "payment",
      entityId: payment.id,
      propertyId: payment.propertyId,
      details: { reference: hold.reference, amountPence: payment.amountPence, message: result.message },
    });
  });
  return {
    ok: false,
    message:
      result.outcome === "REFUSED"
        ? `${result.message} Your dates haven't been held.`
        : "We couldn't confirm your gift voucher with Gift Up. Your dates haven't been held; please try again, or contact us if it keeps happening.",
  };
}

/**
 * Confirms a hold the voucher paid for in full: no card payment involved.
 * Only a live hold whose voucher was redeemed can be confirmed this way.
 */
export async function confirmVoucherOnlyBooking(reservationId: string): Promise<boolean> {
  return db().begin(async (tx) => {
    const [{ propertyId }] = await tx<{ propertyId: string }[]>`SELECT property_id FROM reservations WHERE id = ${reservationId}`;
    await lockPropertyAvailability(tx, propertyId);
    const [r] = await tx<{ reference: string; live: boolean; depositPence: number }[]>`
      SELECT reference, (status = 'HOLD' AND hold_expires_at > now()) AS live, deposit_pence
      FROM reservations WHERE id = ${reservationId} FOR UPDATE
    `;
    if (!r?.live || r.depositPence !== 0) return false;

    const [voucher] = await tx<{ id: string; amountPence: number }[]>`
      UPDATE payments SET status = 'SUCCEEDED', captured_at = now()
      WHERE reservation_id = ${reservationId} AND kind = 'VOUCHER' AND status = 'AUTHORISED'
      RETURNING id, amount_pence
    `;
    if (!voucher) return false;

    await tx`UPDATE reservations SET status = 'CONFIRMED', confirmed_at = now() WHERE id = ${reservationId}`;
    await recordAudit(tx, {
      actorType: "SYSTEM",
      action: "reservation.confirmed",
      entityType: "reservation",
      entityId: reservationId,
      propertyId,
      details: { reference: r.reference, paidBy: "gift voucher", amountPence: voucher.amountPence },
    });
    await enqueueBookingConfirmedEmails(tx, reservationId);
    await queueAfterFirstPayment(tx, reservationId);
    return true;
  });
}

/** Releases a hold and gives its voucher back, e.g. when a voucher-only booking couldn't be confirmed. */
export async function releaseHoldAndVoucher(reservationId: string, reason: string) {
  await db().begin(async (tx) => {
    const [r] = await tx<{ propertyId: string; reference: string }[]>`
      UPDATE reservations SET status = 'EXPIRED' WHERE id = ${reservationId} AND status = 'HOLD'
      RETURNING property_id, reference
    `;
    await cancelHoldVoucher(tx, reservationId);
    if (r) {
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: "reservation.hold_released",
        entityType: "reservation",
        entityId: reservationId,
        propertyId: r.propertyId,
        details: { reference: r.reference, reason },
      });
    }
  });
  await reverseAbandonedVouchers();
}

/**
 * Gives vouchers back for bookings that didn't go ahead: holds that lapsed
 * or were released, or checkouts that were abandoned. Safe to run any time
 * and as often as wanted. Each voucher payment is first marked CANCELLED in
 * the database, which a late Stripe confirmation checks for (and refuses
 * the booking, releasing the card), then the redemption is undone at Gift
 * Up. A failed undo is retried on the next run.
 */
export async function reverseAbandonedVouchers(): Promise<{ reversed: number; failed: number }> {
  const sql = db();
  // Holds released on purpose cancel their voucher at once (cancelHoldVoucher).
  // These are the ones that simply ran out of time, given a few minutes in
  // case the card payment is still on its way.
  await sql`
    UPDATE payments pay SET status = 'CANCELLED', cancelled_at = now()
    FROM reservations r
    WHERE r.id = pay.reservation_id AND pay.kind = 'VOUCHER' AND pay.status = 'AUTHORISED'
      AND (r.status = 'CANCELLED'
        OR (r.status IN ('HOLD', 'EXPIRED') AND r.hold_expires_at < now() - make_interval(mins => ${LATE_PAYMENT_GRACE_MINUTES})))
  `;

  const due = await sql<{ id: string; voucherCode: string; transactionId: string; reference: string; propertyId: string; amountPence: number }[]>`
    SELECT pay.id, pay.voucher_code, pay.giftup_transaction_id AS transaction_id, r.reference, r.property_id, pay.amount_pence
    FROM payments pay JOIN reservations r ON r.id = pay.reservation_id
    WHERE pay.kind = 'VOUCHER' AND pay.status = 'CANCELLED'
      AND pay.giftup_transaction_id IS NOT NULL AND pay.voucher_reversed_at IS NULL
    ORDER BY pay.created_at
    LIMIT 50
  `;

  let reversed = 0;
  let failed = 0;
  for (const p of due) {
    try {
      await undoVoucherRedemption(p.voucherCode, p.transactionId, p.reference);
    } catch (error) {
      failed++;
      logError("Couldn't undo a Gift Up redemption", error);
      await sql`UPDATE payments SET failure_message = ${`Undo failed: ${String((error as Error)?.message).slice(0, 250)}`} WHERE id = ${p.id}`;
      continue;
    }
    reversed++;
    await sql.begin(async (tx) => {
      await tx`UPDATE payments SET voucher_reversed_at = now(), failure_message = NULL WHERE id = ${p.id}`;
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: "voucher.redemption_undone",
        entityType: "payment",
        entityId: p.id,
        propertyId: p.propertyId,
        details: { reference: p.reference, amountPence: p.amountPence },
      });
    });
  }
  return { reversed, failed };
}
