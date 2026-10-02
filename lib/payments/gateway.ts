import "server-only";
import Stripe from "stripe";

// The booking engine talks to payments only through this interface, so
// the provider (and which payment methods it offers) can change without
// touching booking logic, and tests can substitute a fake.

export type CheckoutRequest = {
  reservationId: string;
  paymentId: string;
  reference: string;
  amountPence: number;
  currency: string;
  description: string;
  customerEmail: string;
  /** Unix seconds; Stripe allows 30 minutes to 24 hours ahead. */
  expiresAt: number;
  /** Keep the card on file so the balance can be charged later. */
  saveCardForBalance: boolean;
  successUrl: string;
  cancelUrl: string;
};

export type PaymentIntentInfo = {
  id: string;
  status: string;
  amount: number;
  amountCapturable: number;
  amountReceived: number;
  currency: string;
  customerId: string | null;
  paymentMethodId: string | null;
  metadata: Record<string, string>;
};

export type OffSessionCharge = {
  paymentId: string;
  reservationId: string;
  reference: string;
  customerId: string;
  paymentMethodId: string;
  amountPence: number;
  currency: string;
  description: string;
};

export type ChargeResult =
  | { ok: true; paymentIntentId: string; status: string }
  | { ok: false; paymentIntentId: string | null; code: string; message: string };

export interface PaymentGateway {
  createCheckout(request: CheckoutRequest): Promise<{ sessionId: string; url: string }>;
  expireCheckout(sessionId: string): Promise<void>;
  /** The URL of a still-open checkout, or null once it has completed or expired. */
  checkoutUrl(sessionId: string): Promise<string | null>;
  retrievePaymentIntent(id: string): Promise<PaymentIntentInfo>;
  capture(paymentIntentId: string): Promise<{ status: string }>;
  cancel(paymentIntentId: string): Promise<void>;
  chargeOffSession(charge: OffSessionCharge): Promise<ChargeResult>;
  /** Verifies a webhook's signature and returns the event; throws if invalid. */
  parseWebhook(payload: string, signature: string): Stripe.Event;
}

/**
 * Why payments can't run on this deployment, or null if they can. A live
 * key anywhere but production is refused outright: a test site must never
 * be able to take real money.
 */
export function paymentConfigProblem(): "MISSING" | "LIVE_KEY_OUTSIDE_PRODUCTION" | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "MISSING";
  if (key.startsWith("sk_live_") && process.env.VERCEL_ENV !== "production") return "LIVE_KEY_OUTSIDE_PRODUCTION";
  return null;
}

export function isPaymentConfigured() {
  return paymentConfigProblem() === null;
}

let client: Stripe | null = null;
function stripe() {
  const problem = paymentConfigProblem();
  if (problem) throw new Error(`Stripe can't be used here: ${problem}`);
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20_000 });
  return client;
}

const webhookVerifier = new Stripe("sk_test_signature_verification_only");

const id = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : (value?.id ?? null);

export const stripeGateway: PaymentGateway = {
  async createCheckout(r) {
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        // Cards, including Apple Pay and Google Pay. Other Stripe payment
        // methods can be allowed here later; manual capture must suit them.
        allowed_payment_method_types: ["card"],
        customer_email: r.customerEmail,
        customer_creation: "always",
        client_reference_id: r.reservationId,
        expires_at: r.expiresAt,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: r.currency.toLowerCase(),
              unit_amount: r.amountPence,
              product_data: { name: r.description },
            },
          },
        ],
        payment_intent_data: {
          // Authorise now; we capture only after re-confirming the dates are
          // still ours, so a guest is never charged for dates we can't give.
          capture_method: "manual",
          ...(r.saveCardForBalance ? { setup_future_usage: "off_session" as const } : {}),
          description: r.description,
          metadata: { reservation_id: r.reservationId, payment_id: r.paymentId, reference: r.reference },
        },
        metadata: { reservation_id: r.reservationId, payment_id: r.paymentId, reference: r.reference },
        success_url: r.successUrl,
        cancel_url: r.cancelUrl,
      },
      { idempotencyKey: `checkout-${r.paymentId}` }
    );
    if (!session.url) throw new Error("Stripe didn't return a checkout URL.");
    return { sessionId: session.id, url: session.url };
  },

  async expireCheckout(sessionId) {
    try {
      await stripe().checkout.sessions.expire(sessionId);
    } catch (error) {
      // Already completed or expired: nothing to do.
      if ((error as { type?: string }).type !== "StripeInvalidRequestError") throw error;
    }
  },

  async checkoutUrl(sessionId) {
    const session = await stripe().checkout.sessions.retrieve(sessionId);
    return session.status === "open" ? session.url : null;
  },

  async retrievePaymentIntent(paymentIntentId) {
    const pi = await stripe().paymentIntents.retrieve(paymentIntentId);
    return {
      id: pi.id,
      status: pi.status,
      amount: pi.amount,
      amountCapturable: pi.amount_capturable,
      amountReceived: pi.amount_received,
      currency: pi.currency.toUpperCase(),
      customerId: id(pi.customer),
      paymentMethodId: id(pi.payment_method),
      metadata: pi.metadata ?? {},
    };
  },

  async capture(paymentIntentId) {
    const pi = await stripe().paymentIntents.capture(paymentIntentId, {}, { idempotencyKey: `capture-${paymentIntentId}` });
    return { status: pi.status };
  },

  async cancel(paymentIntentId) {
    await stripe().paymentIntents.cancel(paymentIntentId, {}, { idempotencyKey: `cancel-${paymentIntentId}` });
  },

  async chargeOffSession(c) {
    try {
      const pi = await stripe().paymentIntents.create(
        {
          amount: c.amountPence,
          currency: c.currency.toLowerCase(),
          customer: c.customerId,
          payment_method: c.paymentMethodId,
          off_session: true,
          confirm: true,
          description: c.description,
          metadata: { reservation_id: c.reservationId, payment_id: c.paymentId, reference: c.reference },
        },
        { idempotencyKey: `balance-${c.paymentId}` }
      );
      return { ok: true, paymentIntentId: pi.id, status: pi.status };
    } catch (error) {
      const e = error as { code?: string; message?: string; raw?: { payment_intent?: { id?: string } } };
      return {
        ok: false,
        paymentIntentId: e.raw?.payment_intent?.id ?? null,
        code: e.code ?? "charge_failed",
        message: e.message ?? "The card couldn't be charged.",
      };
    }
  },

  parseWebhook(payload, signature) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
    if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set.");
    // Verifying a signature needs no API access, so this works (and gives a
    // clear answer) whatever state the API key is in.
    return webhookVerifier.webhooks.constructEvent(payload, signature, secret);
  },
};
