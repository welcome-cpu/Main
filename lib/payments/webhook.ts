import "server-only";
import type Stripe from "stripe";
import { recordAudit } from "@/lib/audit";
import { checkAvailability } from "@/lib/booking/availability";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import { db } from "@/lib/db/client";
import type { PaymentGateway, PaymentIntentInfo } from "@/lib/payments/gateway";

// Stripe webhooks are the ONLY thing that confirms a booking or marks money
// as received. The guest reaching the success page proves nothing.
//
// Every handler is idempotent: Stripe may deliver an event more than once,
// out of order, or concurrently. Final states are never undone, captures
// and cancels use Stripe idempotency keys, and confirmation happens under
// the property's availability lock.

type PaymentRow = {
  id: string;
  reservationId: string;
  kind: "DEPOSIT" | "BALANCE" | "FULL";
  status: "PENDING" | "AUTHORISED" | "SUCCEEDED" | "FAILED" | "CANCELLED";
  amountPence: number;
  refundedPence: number;
  currency: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
};

export type WebhookOutcome = { duplicate: boolean; ignored?: string };

export async function handleStripeEvent(event: Stripe.Event, gateway: PaymentGateway): Promise<WebhookOutcome> {
  const sql = db();

  // Events from the other mode (e.g. live events reaching a test setup) are ignored.
  const liveKey = process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
  if (event.livemode !== liveKey) return { duplicate: false, ignored: "wrong mode" };

  const [record] = await sql<{ processedAt: Date | null }[]>`
    INSERT INTO stripe_events (event_id, type, livemode) VALUES (${event.id}, ${event.type}, ${event.livemode})
    ON CONFLICT (event_id) DO UPDATE SET type = EXCLUDED.type
    RETURNING processed_at
  `;
  if (record.processedAt) return { duplicate: true };

  try {
    const ignored = await dispatch(event, gateway);
    await sql`UPDATE stripe_events SET processed_at = now(), processing_error = NULL WHERE event_id = ${event.id}`;
    return { duplicate: false, ignored };
  } catch (error) {
    await sql`
      UPDATE stripe_events SET processing_error = ${String((error as Error).message ?? error).slice(0, 500)}
      WHERE event_id = ${event.id}
    `;
    throw error; // a 500 makes Stripe retry later
  }
}

async function dispatch(event: Stripe.Event, gateway: PaymentGateway): Promise<string | undefined> {
  switch (event.type) {
    case "checkout.session.completed":
      return onCheckoutCompleted(event.data.object, gateway);
    case "checkout.session.expired":
    case "checkout.session.async_payment_failed":
      return onCheckoutEnded(event.data.object);
    case "payment_intent.succeeded":
      return onPaymentIntentSucceeded(event.data.object);
    case "payment_intent.payment_failed":
      return onPaymentIntentFailed(event.data.object);
    case "payment_intent.canceled":
      return onPaymentIntentCanceled(event.data.object);
    case "charge.refunded":
      return onChargeRefunded(event.data.object);
    default:
      return `unhandled type ${event.type}`;
  }
}

// ---------------------------------------------------------------------------
// Deposit / full payment through Checkout
// ---------------------------------------------------------------------------

async function onCheckoutCompleted(session: Stripe.Checkout.Session, gateway: PaymentGateway) {
  const payment = await findPaymentForSession(session);
  if (!payment) return "not one of our checkouts";
  if (payment.status === "SUCCEEDED" || payment.status === "FAILED" || payment.status === "CANCELLED") {
    return "payment already final";
  }

  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  if (!paymentIntentId) return "no payment intent yet";
  const pi = await gateway.retrievePaymentIntent(paymentIntentId);

  if (pi.status !== "requires_capture" && pi.status !== "succeeded") return `payment intent is ${pi.status}`;

  // The authorised amount must be exactly what we asked for.
  const authorised = pi.status === "requires_capture" ? pi.amountCapturable : pi.amountReceived;
  if (authorised !== payment.amountPence || pi.currency !== payment.currency) {
    if (pi.status === "requires_capture") await gateway.cancel(pi.id);
    await failPayment(payment, pi.id, "amount_mismatch", `Expected ${payment.amountPence} ${payment.currency}, got ${authorised} ${pi.currency}`);
    return "amount mismatch";
  }

  const decision = await confirmReservation(payment, pi);

  if (decision === "UNAVAILABLE") {
    // The dates went to someone else (e.g. the hold lapsed before payment).
    // Release the authorisation: the guest is never charged.
    if (pi.status === "requires_capture") await gateway.cancel(pi.id);
    await db().begin(async (tx) => {
      await tx`
        UPDATE payments SET status = 'CANCELLED', cancelled_at = now(), stripe_payment_intent_id = ${pi.id},
          failure_code = 'dates_unavailable', failure_message = 'Dates no longer available when payment arrived'
        WHERE id = ${payment.id} AND status IN ('PENDING', 'AUTHORISED')
      `;
      const [r] = await tx<{ propertyId: string; reference: string }[]>`
        UPDATE reservations SET cancellation_reason = 'Dates no longer available when payment arrived'
        WHERE id = ${payment.reservationId} RETURNING property_id, reference
      `;
      await recordAudit(tx, {
        actorType: "STRIPE",
        action: "payment.voided_dates_unavailable",
        entityType: "reservation",
        entityId: payment.reservationId,
        propertyId: r?.propertyId,
        details: { reference: r?.reference, paymentIntentId: pi.id, amountPence: authorised },
      });
    });
    return "dates unavailable; authorisation released";
  }

  // Confirmed (now or by an earlier delivery): take the money.
  if (pi.status === "succeeded") {
    await markSucceeded(payment.id, pi.id);
    return undefined;
  }
  try {
    await gateway.capture(pi.id);
  } catch (error) {
    await failCapture(payment, pi.id, error);
    return "capture failed";
  }
  await markSucceeded(payment.id, pi.id);
  return undefined;
}

/**
 * Turns the hold into a confirmed reservation, under the availability lock.
 * If the hold already lapsed, the booking still goes ahead only if the
 * dates are still free; the exclusion constraint is the final backstop.
 */
async function confirmReservation(
  payment: PaymentRow,
  pi: PaymentIntentInfo
): Promise<"CONFIRMED" | "ALREADY_CONFIRMED" | "UNAVAILABLE"> {
  return db().begin(async (tx) => {
    const [{ propertyId }] = await tx<{ propertyId: string }[]>`
      SELECT property_id FROM reservations WHERE id = ${payment.reservationId}
    `;
    await lockPropertyAvailability(tx, propertyId);

    const [r] = await tx<{
      id: string;
      reference: string;
      status: string;
      live: boolean;
      checkIn: string;
      checkOut: string;
      adults: number;
      children: number;
      infants: number;
      pets: number;
      guestId: string | null;
      totalPence: number;
      depositPence: number;
      balanceDueDate: string | null;
      currency: string;
    }[]>`
      SELECT id, reference, status, (status = 'HOLD' AND hold_expires_at > now()) AS live,
             check_in, check_out, adults, children, infants, pets, guest_id,
             total_pence, deposit_pence, balance_due_date, currency
      FROM reservations WHERE id = ${payment.reservationId} FOR UPDATE
    `;
    if (r.status === "CONFIRMED") return "ALREADY_CONFIRMED";
    if (r.status === "CANCELLED") return "UNAVAILABLE";

    if (!r.live) {
      const availability = await checkAvailability(
        tx,
        propertyId,
        { checkIn: r.checkIn, checkOut: r.checkOut, adults: r.adults, children: r.children, infants: r.infants, pets: r.pets },
        { excludeReservationId: r.id, ignoreBookingRules: true }
      );
      if (!availability?.available) return "UNAVAILABLE";
    }

    try {
      await tx.savepoint(async (sp) => {
        await sp`UPDATE reservations SET status = 'CONFIRMED', confirmed_at = now() WHERE id = ${r.id}`;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23P01") return "UNAVAILABLE";
      throw error;
    }

    await tx`
      UPDATE payments SET status = 'AUTHORISED', authorised_at = now(), stripe_payment_intent_id = ${pi.id},
        stripe_customer_id = ${pi.customerId}, stripe_payment_method_id = ${pi.paymentMethodId}
      WHERE id = ${payment.id}
    `;
    if (r.guestId && pi.customerId) {
      await tx`UPDATE guests SET stripe_customer_id = ${pi.customerId} WHERE id = ${r.guestId} AND stripe_customer_id IS NULL`;
    }

    const balance = r.totalPence - r.depositPence;
    if (balance > 0 && r.balanceDueDate) {
      await tx`
        INSERT INTO payments (reservation_id, provider, kind, status, amount_pence, currency, due_date,
          stripe_customer_id, stripe_payment_method_id)
        VALUES (${r.id}, 'STRIPE', 'BALANCE', 'PENDING', ${balance}, ${r.currency}, ${r.balanceDueDate},
          ${pi.customerId}, ${pi.paymentMethodId})
        ON CONFLICT DO NOTHING
      `;
    }

    await recordAudit(tx, {
      actorType: "STRIPE",
      action: "reservation.confirmed",
      entityType: "reservation",
      entityId: r.id,
      propertyId,
      details: { reference: r.reference, paymentIntentId: pi.id, amountPence: payment.amountPence, lateConfirmation: !r.live },
    });
    return "CONFIRMED";
  });
}

async function markSucceeded(paymentId: string, paymentIntentId: string) {
  await db().begin(async (tx) => {
    const [p] = await tx<{ reservationId: string; amountPence: number; kind: string }[]>`
      UPDATE payments SET status = 'SUCCEEDED', captured_at = COALESCE(captured_at, now()),
        stripe_payment_intent_id = COALESCE(stripe_payment_intent_id, ${paymentIntentId})
      WHERE id = ${paymentId} AND status IN ('PENDING', 'AUTHORISED')
      RETURNING reservation_id, amount_pence, kind
    `;
    if (!p) return; // already recorded
    await recordAudit(tx, {
      actorType: "STRIPE",
      action: "payment.confirmed",
      entityType: "payment",
      entityId: paymentId,
      details: { reservationId: p.reservationId, kind: p.kind, amountPence: p.amountPence, paymentIntentId },
    });
  });
}

async function failCapture(payment: PaymentRow, paymentIntentId: string, error: unknown) {
  console.error("Stripe capture failed", error);
  await db().begin(async (tx) => {
    await tx`
      UPDATE payments SET status = 'FAILED', failed_at = now(), stripe_payment_intent_id = ${paymentIntentId},
        failure_code = 'capture_failed', failure_message = ${String((error as Error)?.message ?? "Capture failed").slice(0, 300)}
      WHERE id = ${payment.id} AND status IN ('PENDING', 'AUTHORISED')
    `;
    // No money, no booking: release the dates.
    const [r] = await tx<{ propertyId: string; reference: string }[]>`
      UPDATE reservations SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = 'Payment could not be taken'
      WHERE id = ${payment.reservationId} AND status = 'CONFIRMED'
      RETURNING property_id, reference
    `;
    await recordAudit(tx, {
      actorType: "STRIPE",
      action: "payment.capture_failed",
      entityType: "reservation",
      entityId: payment.reservationId,
      propertyId: r?.propertyId,
      details: { reference: r?.reference, paymentIntentId },
    });
  });
}

async function failPayment(payment: PaymentRow, paymentIntentId: string, code: string, message: string) {
  await db().begin(async (tx) => {
    await tx`
      UPDATE payments SET status = 'FAILED', failed_at = now(), stripe_payment_intent_id = ${paymentIntentId},
        failure_code = ${code}, failure_message = ${message.slice(0, 300)}
      WHERE id = ${payment.id} AND status IN ('PENDING', 'AUTHORISED')
    `;
    await recordAudit(tx, {
      actorType: "STRIPE",
      action: "payment.failed",
      entityType: "payment",
      entityId: payment.id,
      details: { reservationId: payment.reservationId, code, message },
    });
  });
}

/** Checkout expired or failed without payment: free the hold early. */
async function onCheckoutEnded(session: Stripe.Checkout.Session) {
  const payment = await findPaymentForSession(session);
  if (!payment) return "not one of our checkouts";
  await db().begin(async (tx) => {
    const [p] = await tx`
      UPDATE payments SET status = 'CANCELLED', cancelled_at = now()
      WHERE id = ${payment.id} AND status = 'PENDING' RETURNING id
    `;
    if (!p) return;
    const [r] = await tx<{ propertyId: string; reference: string }[]>`
      UPDATE reservations SET status = 'EXPIRED' WHERE id = ${payment.reservationId} AND status = 'HOLD'
      RETURNING property_id, reference
    `;
    if (r) {
      await recordAudit(tx, {
        actorType: "STRIPE",
        action: "reservation.hold_expired",
        entityType: "reservation",
        entityId: payment.reservationId,
        propertyId: r.propertyId,
        details: { reference: r.reference, reason: "Checkout ended without payment" },
      });
    }
  });
  return undefined;
}

// ---------------------------------------------------------------------------
// Payment intent events (balance charges, cancellations, refunds)
// ---------------------------------------------------------------------------

async function onPaymentIntentSucceeded(pi: Stripe.PaymentIntent) {
  const payment = await findPaymentForIntent(pi);
  if (!payment) return "not one of our payments";
  // Deposits are confirmed via checkout.session.completed, which also checks
  // the dates. This only records money that arrived for a known payment.
  if (payment.kind !== "BALANCE" && payment.status === "PENDING") return "deposit awaiting checkout confirmation";
  if (pi.amount_received !== payment.amountPence) return "amount differs; left for review";
  await markSucceeded(payment.id, pi.id);
  return undefined;
}

async function onPaymentIntentFailed(pi: Stripe.PaymentIntent) {
  const payment = await findPaymentForIntent(pi);
  if (!payment) return "not one of our payments";
  if (payment.kind !== "BALANCE") return "checkout handles its own retries";
  await failPayment(
    payment,
    pi.id,
    pi.last_payment_error?.code ?? "payment_failed",
    pi.last_payment_error?.message ?? "The payment failed."
  );
  return undefined;
}

async function onPaymentIntentCanceled(pi: Stripe.PaymentIntent) {
  const payment = await findPaymentForIntent(pi);
  if (!payment) return "not one of our payments";
  await db()`
    UPDATE payments SET status = 'CANCELLED', cancelled_at = now()
    WHERE id = ${payment.id} AND status IN ('PENDING', 'AUTHORISED')
  `;
  return undefined;
}

async function onChargeRefunded(charge: Stripe.Charge) {
  const paymentIntentId = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!paymentIntentId) return "no payment intent";
  await db().begin(async (tx) => {
    const [p] = await tx<{ id: string; reservationId: string; refundedPence: number }[]>`
      UPDATE payments SET refunded_pence = LEAST(${charge.amount_refunded}, amount_pence)
      WHERE stripe_payment_intent_id = ${paymentIntentId} AND status = 'SUCCEEDED'
      RETURNING id, reservation_id, refunded_pence
    `;
    if (!p) return;
    await recordAudit(tx, {
      actorType: "STRIPE",
      action: "payment.refunded",
      entityType: "payment",
      entityId: p.id,
      details: { reservationId: p.reservationId, refundedPence: p.refundedPence },
    });
  });
  return undefined;
}

// ---------------------------------------------------------------------------

async function findPaymentForSession(session: Stripe.Checkout.Session) {
  const paymentId = session.metadata?.payment_id;
  if (!paymentId || !/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const [p] = await db()<PaymentRow[]>`
    SELECT id, reservation_id, kind, status, amount_pence, refunded_pence, currency,
           stripe_checkout_session_id, stripe_payment_intent_id
    FROM payments WHERE id = ${paymentId} AND stripe_checkout_session_id = ${session.id}
  `;
  return p ?? null;
}

async function findPaymentForIntent(pi: Stripe.PaymentIntent) {
  const paymentId = pi.metadata?.payment_id;
  const [p] = await db()<PaymentRow[]>`
    SELECT id, reservation_id, kind, status, amount_pence, refunded_pence, currency,
           stripe_checkout_session_id, stripe_payment_intent_id
    FROM payments
    WHERE stripe_payment_intent_id = ${pi.id}
       OR (${paymentId ?? null}::text IS NOT NULL AND id::text = ${paymentId ?? null})
    LIMIT 1
  `;
  return p ?? null;
}

