import "server-only";
import { recordAudit } from "@/lib/audit";
import { GUEST_FACING_HOLD_MINUTES } from "@/lib/booking/holds";
import { db } from "@/lib/db/client";
import { logError } from "@/lib/log";
import type { PaymentGateway } from "@/lib/payments/gateway";
import type { Quote } from "@/lib/pricing/quote";

// Stripe requires a Checkout Session to stay open for at least 30 minutes.
const STRIPE_MIN_OPEN_SECONDS = 30 * 60 + 15;

/**
 * Opens a Stripe Checkout for a fresh hold. The amount is the hold's own
 * server-calculated "due now" figure. If Stripe can't be reached the hold
 * is released at once, so dates aren't left blocked.
 */
export async function startCheckout(
  gateway: PaymentGateway,
  hold: { reservationId: string; reference: string; quote: Quote },
  context: { propertyName: string; guestEmail: string; origin: string; slug: string }
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const sql = db();
  const { quote } = hold;
  if (quote.dueNowPence <= 0) {
    await releaseFailedCheckout(hold.reservationId, null, "Nothing to pay online");
    return { ok: false, message: "This booking can't be paid online. Please contact us to book." };
  }

  const [payment] = await sql<{ id: string }[]>`
    INSERT INTO payments (reservation_id, provider, kind, status, amount_pence, currency)
    VALUES (${hold.reservationId}, 'STRIPE', ${quote.balanceDueDate ? "DEPOSIT" : "FULL"}, 'PENDING',
            ${quote.dueNowPence}, ${quote.currency})
    RETURNING id
  `;

  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const { sessionId, url } = await gateway.createCheckout({
      reservationId: hold.reservationId,
      paymentId: payment.id,
      reference: hold.reference,
      amountPence: quote.dueNowPence,
      currency: quote.currency,
      description: `${context.propertyName} ${quote.checkIn} to ${quote.checkOut} (${quote.balanceDueDate ? "deposit" : "payment in full"}), ref ${hold.reference}`,
      customerEmail: context.guestEmail,
      expiresAt: nowSeconds + Math.max(GUEST_FACING_HOLD_MINUTES * 60, STRIPE_MIN_OPEN_SECONDS),
      saveCardForBalance: quote.balanceDueDate !== null,
      successUrl: `${context.origin}/book/${context.slug}/confirmation?reservation=${hold.reservationId}`,
      cancelUrl: `${context.origin}/book/${context.slug}/confirmation?reservation=${hold.reservationId}&cancelled=1`,
    });
    await sql`UPDATE payments SET stripe_checkout_session_id = ${sessionId} WHERE id = ${payment.id}`;
    return { ok: true, url };
  } catch (error) {
    logError("Couldn't start Stripe checkout", error);
    await releaseFailedCheckout(hold.reservationId, payment.id, "Couldn't start payment");
    return { ok: false, message: "We couldn't start the payment. Your dates haven't been held; please try again." };
  }
}

async function releaseFailedCheckout(reservationId: string, paymentId: string | null, reason: string) {
  await db().begin(async (tx) => {
    if (paymentId) {
      await tx`UPDATE payments SET status = 'CANCELLED', cancelled_at = now() WHERE id = ${paymentId}`;
    }
    const [row] = await tx<{ propertyId: string; reference: string }[]>`
      UPDATE reservations SET status = 'EXPIRED' WHERE id = ${reservationId} AND status = 'HOLD'
      RETURNING property_id, reference
    `;
    if (row) {
      await recordAudit(tx, {
        actorType: "SYSTEM",
        action: "reservation.hold_released",
        entityType: "reservation",
        entityId: reservationId,
        propertyId: row.propertyId,
        details: { reference: row.reference, reason },
      });
    }
  });
}
