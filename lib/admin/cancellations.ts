import "server-only";
import type { AdminUser } from "@/lib/admin/users";
import { recordAudit } from "@/lib/audit";
import {
  allocateToCardPayments,
  calculateCancellationRefund,
  describeRefundRule,
  splitRefund,
  type PaidBy,
  type RefundDecision,
} from "@/lib/booking/cancellation-refund";
import { cancelBookingInLodgify, type LodgifyCancelOutcome } from "@/lib/booking/lodgify-cancel";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import { db, type Sql, type Tx } from "@/lib/db/client";
import { todayInZone } from "@/lib/dates";
import { enqueueBookingCancelledEmail } from "@/lib/email/booking-emails";
import { logError } from "@/lib/log";
import type { PaymentGateway } from "@/lib/payments/gateway";

// Cancelling a confirmed booking with a refund. The owner sees the refund
// worked out on the booking page and approves that exact amount. The booking
// is cancelled first and the money follows: a failed refund then leaves a
// cancelled booking with a refund to retry, never a refund on a live booking.

export type CancellationPreview = RefundDecision &
  PaidBy & {
    totalPence: number;
    paidPence: number;
    cancelledOn: string;
    voucherCode: string | null;
    moved: boolean;
    explanation: string;
  };

type CardPayment = { paymentId: string; paymentIntentId: string; refundablePence: number; refundedBefore: number };

/** Works out the refund as of `now`, from what's in the database. */
async function workOut(sql: Sql | Tx, id: string, now: Date) {
  const [r] = await sql<
    {
      status: string;
      reference: string;
      propertyId: string;
      checkIn: string;
      totalPence: number;
      createdAt: Date;
      movedAt: Date | null;
      arrivalWhenMoved: string | null;
    }[]
  >`
    SELECT status, reference, property_id, check_in::text, total_pence, created_at, moved_at, arrival_when_moved::text
    FROM reservations WHERE id = ${id}
  `;
  if (!r) return null;
  const payments = await sql<
    { id: string; provider: string; kind: string; amountPence: number; refundedPence: number; stripePaymentIntentId: string | null; voucherCode: string | null }[]
  >`
    SELECT id, provider, kind, amount_pence, refunded_pence, stripe_payment_intent_id, voucher_code
    FROM payments WHERE reservation_id = ${id} AND status = 'SUCCEEDED'
    ORDER BY created_at DESC
  `;

  const paidBy: PaidBy = { cardPence: 0, voucherPence: 0, manualPence: 0 };
  const cards: CardPayment[] = [];
  let voucherCode: string | null = null;
  for (const p of payments) {
    const net = p.amountPence - p.refundedPence;
    if (p.kind === "VOUCHER") {
      paidBy.voucherPence += net;
      voucherCode ??= p.voucherCode;
    } else if (p.provider === "STRIPE" && p.stripePaymentIntentId) {
      paidBy.cardPence += net;
      cards.push({ paymentId: p.id, paymentIntentId: p.stripePaymentIntentId, refundablePence: net, refundedBefore: p.refundedPence });
    } else {
      paidBy.manualPence += net;
    }
  }

  const paidPence = paidBy.cardPence + paidBy.voucherPence + paidBy.manualPence;
  const move = r.movedAt && r.arrivalWhenMoved ? { movedAt: r.movedAt, arrivalWhenMoved: r.arrivalWhenMoved } : null;
  const decision = calculateCancellationRefund({
    totalPence: r.totalPence,
    paidPence,
    arrivalDate: r.checkIn,
    bookedAt: r.createdAt,
    cancelledAt: now,
    move,
  });
  const preview: CancellationPreview = {
    ...decision,
    ...splitRefund(decision.refundPence, paidBy),
    totalPence: r.totalPence,
    paidPence,
    cancelledOn: todayInZone("Europe/London", now),
    voucherCode,
    moved: Boolean(move),
    explanation: describeRefundRule(decision, Boolean(move)),
  };
  return { reservation: r, preview, cards };
}

/** What cancelling would refund right now, for the owner to approve. */
export async function previewCancellation(id: string, now = new Date()): Promise<CancellationPreview | null> {
  return (await workOut(db(), id, now))?.preview ?? null;
}

export type CancelRefundResult = {
  error?: string;
  preview?: CancellationPreview;
  refundError?: string;
  lodgify?: LodgifyCancelOutcome;
};

export async function cancelBookingWithRefund(
  admin: AdminUser,
  id: string,
  input: { reason: string; emailGuest: boolean; approvedRefundPence: number },
  options: { gateway: PaymentGateway; paymentsReady: boolean; now?: Date }
): Promise<CancelRefundResult> {
  const now = options.now ?? new Date();
  const started = await db().begin(async (tx): Promise<CancelRefundResult> => {
    const [locked] = await tx<{ propertyId: string }[]>`SELECT property_id FROM reservations WHERE id = ${id}`;
    if (!locked) return { error: "Booking not found." };
    await lockPropertyAvailability(tx, locked.propertyId);
    await tx`SELECT id FROM reservations WHERE id = ${id} FOR UPDATE`;

    const found = await workOut(tx, id, now);
    if (!found || found.reservation.status !== "CONFIRMED") return { error: "Only confirmed bookings can be cancelled with a refund." };
    const { preview, reservation, cards } = found;

    // The owner approved one amount: if it no longer holds, they decide again.
    if (preview.refundPence !== input.approvedRefundPence) {
      return { error: "The refund has changed since this page loaded, so nothing has been done. Check the new amount and approve it again." };
    }
    if (preview.cardPence > 0 && !options.paymentsReady) {
      return { error: "Card refunds can't be made here because Stripe isn't set up, so nothing has been done." };
    }

    await tx`
      UPDATE reservations SET status = 'CANCELLED', cancelled_at = ${now}, cancellation_reason = ${input.reason}
      WHERE id = ${id}
    `;
    await tx`
      UPDATE payments SET status = 'CANCELLED', cancelled_at = ${now}
      WHERE reservation_id = ${id} AND kind = 'BALANCE' AND status = 'PENDING'
    `;
    const cardRefunds = allocateToCardPayments(preview.cardPence, cards).map((c) => ({
      paymentId: c.paymentId,
      paymentIntentId: c.paymentIntentId,
      pence: c.pence,
      refundedBefore: c.refundedBefore,
      refundId: null,
    }));
    await tx`
      INSERT INTO cancellation_refunds (reservation_id, rule, days_before, cancelled_on, total_pence, paid_pence, refund_pence,
        card_pence, voucher_pence, manual_pence, voucher_code, card_refunds, status, email_guest, approved_by)
      VALUES (${id}, ${preview.rule}, ${preview.daysBefore}, ${preview.cancelledOn}, ${preview.totalPence}, ${preview.paidPence}, ${preview.refundPence},
        ${preview.cardPence}, ${preview.voucherPence}, ${preview.manualPence}, ${preview.voucherCode},
        ${tx.json(cardRefunds)}, 'PENDING', ${input.emailGuest}, ${admin.email})
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: id,
      propertyId: reservation.propertyId,
      details: {
        reference: reservation.reference,
        reason: input.reason,
        previousStatus: "CONFIRMED",
        emailedGuest: input.emailGuest,
        rule: preview.rule,
        daysBefore: preview.daysBefore,
        refundPence: preview.refundPence,
        cardPence: preview.cardPence,
        voucherPence: preview.voucherPence,
        manualPence: preview.manualPence,
      },
    });
    return { preview };
  });
  if (started.error) return started;

  const refundError = await issueRefund(admin, id, options.gateway);
  const lodgify = await cancelBookingInLodgify(id);
  return { preview: started.preview, refundError: refundError ?? undefined, lodgify };
}

type RefundItem = { paymentId: string; paymentIntentId: string; pence: number; refundedBefore: number; refundId: string | null };

/** Makes the card refunds still to do, then emails the guest. Returns what went wrong, if anything. */
async function issueRefund(admin: AdminUser, id: string, gateway: PaymentGateway): Promise<string | null> {
  const sql = db();
  // Claiming the row means two clicks can't both be refunding. A claim left by
  // a server stopped part-way can be taken over after a few minutes.
  const [row] = await sql<
    { cardRefunds: RefundItem[]; reference: string; propertyId: string; emailGuest: boolean; cardPence: number; voucherPence: number; manualPence: number; voucherCode: string | null }[]
  >`
    UPDATE cancellation_refunds c SET status = 'PROCESSING', claimed_at = now(), failure_message = NULL
    FROM reservations r
    WHERE c.reservation_id = ${id} AND r.id = c.reservation_id
      AND (c.status IN ('PENDING', 'FAILED') OR (c.status = 'PROCESSING' AND c.claimed_at < now() - interval '5 minutes'))
    RETURNING c.card_refunds, r.reference, r.property_id, c.email_guest, c.card_pence, c.voucher_pence, c.manual_pence, c.voucher_code
  `;
  if (!row) return "This refund is already being made, or has been made.";

  const items = row.cardRefunds;
  for (const item of items) {
    if (item.refundId) continue;
    try {
      const { refundId } = await gateway.refund({
        paymentIntentId: item.paymentIntentId,
        amountPence: item.pence,
        idempotencyKey: `cancel-refund-${item.paymentId}-${item.pence}`,
        reservationId: id,
        reference: row.reference,
      });
      item.refundId = refundId;
    } catch (error) {
      logError("Cancellation refund failed", error);
      const message = String((error as Error)?.message ?? error).slice(0, 400);
      await sql.begin(async (tx) => {
        await tx`
          UPDATE cancellation_refunds SET status = 'FAILED', failure_message = ${message}, card_refunds = ${tx.json(items)}
          WHERE reservation_id = ${id}
        `;
        await recordAudit(tx, {
          actorType: "ADMIN",
          actor: admin.email,
          action: "refund.failed",
          entityType: "reservation",
          entityId: id,
          propertyId: row.propertyId,
          details: { reference: row.reference, paymentId: item.paymentId, pence: item.pence, message },
        });
      });
      return message;
    }

    await sql.begin(async (tx) => {
      // Stripe's webhook sets the same figure, so whichever arrives first, it's counted once.
      await tx`UPDATE payments SET refunded_pence = GREATEST(refunded_pence, ${item.refundedBefore + item.pence}) WHERE id = ${item.paymentId}`;
      await tx`UPDATE cancellation_refunds SET card_refunds = ${tx.json(items)} WHERE reservation_id = ${id}`;
      await recordAudit(tx, {
        actorType: "ADMIN",
        actor: admin.email,
        action: "payment.refund_issued",
        entityType: "payment",
        entityId: item.paymentId,
        propertyId: row.propertyId,
        details: { reservationId: id, reference: row.reference, pence: item.pence, refundId: item.refundId },
      });
    });
  }

  await sql.begin(async (tx) => {
    await tx`UPDATE cancellation_refunds SET status = 'DONE', completed_at = now() WHERE reservation_id = ${id}`;
    if (row.emailGuest) {
      await enqueueBookingCancelledEmail(tx, id, {
        cardPence: row.cardPence,
        voucherPence: row.voucherPence,
        voucherCode: row.voucherCode,
        manualPence: row.manualPence,
      });
    }
  });
  return null;
}

export async function retryCancellationRefund(admin: AdminUser, id: string, gateway: PaymentGateway): Promise<{ error?: string }> {
  const error = await issueRefund(admin, id, gateway);
  return error ? { error } : {};
}

export type CancellationRecord = {
  rule: string;
  daysBefore: number;
  cancelledOn: string;
  refundPence: number;
  cardPence: number;
  voucherPence: number;
  voucherCode: string | null;
  manualPence: number;
  status: "PENDING" | "PROCESSING" | "FAILED" | "DONE";
  failureMessage: string | null;
  approvedBy: string;
};

export async function getCancellationRecord(id: string): Promise<CancellationRecord | null> {
  const [row] = await db()<CancellationRecord[]>`
    SELECT rule, days_before, cancelled_on::text, refund_pence, card_pence, voucher_pence, voucher_code, manual_pence,
           status, failure_message, approved_by
    FROM cancellation_refunds WHERE reservation_id = ${id}
  `;
  return row ?? null;
}
