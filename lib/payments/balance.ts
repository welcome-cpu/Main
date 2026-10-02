import "server-only";
import { recordAudit } from "@/lib/audit";
import { todayInZone } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { enqueueBalanceFailedEmails, enqueueBalanceReceivedEmail } from "@/lib/email/booking-emails";
import type { PaymentGateway } from "@/lib/payments/gateway";

export type BalanceOutcome = { paymentId: string; reference: string; ok: boolean; message?: string };

/**
 * Charges balances that have fallen due, using the card the guest saved
 * when paying the deposit. Safe to run repeatedly: each balance uses a
 * Stripe idempotency key, so it can only ever be charged once. Failures
 * (e.g. the bank asks the guest to authenticate) are recorded for
 * follow-up; the booking itself stays confirmed.
 */
export async function chargeDueBalances(gateway: PaymentGateway, now: Date = new Date()): Promise<BalanceOutcome[]> {
  const sql = db();
  const today = todayInZone("Europe/London", now);
  const due = await sql<
    {
      id: string;
      reservationId: string;
      reference: string;
      amountPence: number;
      currency: string;
      customerId: string;
      paymentMethodId: string;
      propertyName: string;
      propertyId: string;
      checkIn: string;
    }[]
  >`
    SELECT pay.id, pay.reservation_id, r.reference, pay.amount_pence, pay.currency,
           pay.stripe_customer_id AS customer_id, pay.stripe_payment_method_id AS payment_method_id,
           p.name AS property_name, p.id AS property_id, r.check_in
    FROM payments pay
    JOIN reservations r ON r.id = pay.reservation_id
    JOIN properties p ON p.id = r.property_id
    WHERE pay.kind = 'BALANCE' AND pay.status = 'PENDING' AND pay.due_date <= ${today}
      AND r.status = 'CONFIRMED'
      AND pay.stripe_customer_id IS NOT NULL AND pay.stripe_payment_method_id IS NOT NULL
    ORDER BY pay.due_date
  `;

  const outcomes: BalanceOutcome[] = [];
  for (const b of due) {
    const result = await gateway.chargeOffSession({
      paymentId: b.id,
      reservationId: b.reservationId,
      reference: b.reference,
      customerId: b.customerId,
      paymentMethodId: b.paymentMethodId,
      amountPence: b.amountPence,
      currency: b.currency,
      description: `${b.propertyName} balance, arriving ${b.checkIn}, ref ${b.reference}`,
    });

    await sql.begin(async (tx) => {
      if (result.ok && result.status === "succeeded") {
        const updated = await tx`
          UPDATE payments SET status = 'SUCCEEDED', captured_at = now(), stripe_payment_intent_id = ${result.paymentIntentId}
          WHERE id = ${b.id} AND status = 'PENDING'
        `;
        if (updated.count === 0) return; // recorded already (e.g. by the webhook)
        await enqueueBalanceReceivedEmail(tx, b.reservationId, b.id, b.amountPence);
        await recordAudit(tx, {
          actorType: "SYSTEM",
          action: "payment.confirmed",
          entityType: "payment",
          entityId: b.id,
          propertyId: b.propertyId,
          details: { reference: b.reference, kind: "BALANCE", amountPence: b.amountPence, paymentIntentId: result.paymentIntentId },
        });
      } else {
        const code = result.ok ? `status_${result.status}` : result.code;
        const message = result.ok ? `Payment is ${result.status}` : result.message;
        const updated = await tx`
          UPDATE payments SET status = 'FAILED', failed_at = now(),
            stripe_payment_intent_id = COALESCE(${result.paymentIntentId}, stripe_payment_intent_id),
            failure_code = ${code}, failure_message = ${message.slice(0, 300)}
          WHERE id = ${b.id} AND status = 'PENDING'
        `;
        if (updated.count === 0) return;
        await enqueueBalanceFailedEmails(tx, b.reservationId, b.id, b.amountPence);
        await recordAudit(tx, {
          actorType: "SYSTEM",
          action: "payment.failed",
          entityType: "payment",
          entityId: b.id,
          propertyId: b.propertyId,
          details: { reference: b.reference, kind: "BALANCE", code, message },
        });
      }
    });
    outcomes.push({ paymentId: b.id, reference: b.reference, ok: result.ok && result.status === "succeeded" });
  }
  return outcomes;
}
