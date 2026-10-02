// Stripe payments against a real database (npm run test:integration), with
// a fake payment gateway standing in for Stripe's API. Webhook signatures
// are checked with Stripe's real library.

import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { PaymentGateway, PaymentIntentInfo } from "@/lib/payments/gateway";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Holds = typeof import("@/lib/booking/holds");
type Checkout = typeof import("@/lib/payments/checkout");
type Webhook = typeof import("@/lib/payments/webhook");
type Balance = typeof import("@/lib/payments/balance");

let dbMod: Db;
let holds: Holds;
let checkout: Checkout;
let webhook: Webhook;
let balance: Balance;

const guest = { firstName: "Pay", lastName: "Tester", email: "pay@example.com", phone: "07700 900001", country: null, message: null };

/** A stand-in for Stripe that records what the booking system asked it to do. */
class FakeGateway implements PaymentGateway {
  calls: { method: string; arg: string }[] = [];
  intents = new Map<string, PaymentIntentInfo>();
  failCapture = false;
  chargeResult: "succeeded" | "fail" = "succeeded";

  async createCheckout(r: Parameters<PaymentGateway["createCheckout"]>[0]) {
    this.calls.push({ method: "createCheckout", arg: r.paymentId });
    return { sessionId: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.test/pay" };
  }
  async expireCheckout(sessionId: string) {
    this.calls.push({ method: "expireCheckout", arg: sessionId });
  }
  async checkoutUrl() {
    return null;
  }
  async retrievePaymentIntent(id: string) {
    const pi = this.intents.get(id);
    if (!pi) throw new Error(`unknown intent ${id}`);
    return pi;
  }
  async capture(id: string) {
    this.calls.push({ method: "capture", arg: id });
    if (this.failCapture) throw new Error("card_declined");
    const pi = this.intents.get(id)!;
    this.intents.set(id, { ...pi, status: "succeeded", amountReceived: pi.amountCapturable, amountCapturable: 0 });
    return { status: "succeeded" };
  }
  async cancel(id: string) {
    this.calls.push({ method: "cancel", arg: id });
  }
  async chargeOffSession(c: Parameters<PaymentGateway["chargeOffSession"]>[0]) {
    this.calls.push({ method: "chargeOffSession", arg: c.paymentId });
    return this.chargeResult === "succeeded"
      ? { ok: true as const, paymentIntentId: `pi_balance_${c.paymentId}`, status: "succeeded" }
      : { ok: false as const, paymentIntentId: `pi_balance_${c.paymentId}`, code: "authentication_required", message: "Needs authentication" };
  }
  parseWebhook(): Stripe.Event {
    throw new Error("not used");
  }
  count(method: string) {
    return this.calls.filter((c) => c.method === method).length;
  }
}

let gateway: FakeGateway;

async function createProperty() {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence, pet_fee_pence,
      default_min_nights, deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, 'Payment test', true, 4, 2, 15000, 4000, 2, 50, 7, 3650, 0)
    RETURNING id
  `;
  return { id, slug };
}

/** A hold with a started checkout, as the hold endpoint would create. */
async function heldBooking(checkIn: string, checkOut: string) {
  const p = await createProperty();
  const hold = await holds.createHold(p.id, { checkIn, checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
  if (!hold.ok) throw new Error("expected a hold");
  const started = await checkout.startCheckout(gateway, hold, { propertyName: "Payment test", guestEmail: guest.email, origin: "https://example.test", slug: p.slug });
  if (!started.ok) throw new Error("expected checkout");
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments WHERE reservation_id = ${hold.reservationId}
  `;
  return { property: p, hold, payment };
}

/** Stripe has authorised the card; returns the checkout.session.completed event. */
function authorised(b: Awaited<ReturnType<typeof heldBooking>>, overrides: Partial<PaymentIntentInfo> = {}) {
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  gateway.intents.set(piId, {
    id: piId,
    status: "requires_capture",
    amount: b.payment.amountPence,
    amountCapturable: b.payment.amountPence,
    amountReceived: 0,
    currency: "GBP",
    customerId: `cus_${randomUUID().slice(0, 8)}`,
    paymentMethodId: `pm_${randomUUID().slice(0, 8)}`,
    metadata: {},
    ...overrides,
  });
  return completedEvent(b, piId);
}

function completedEvent(b: Awaited<ReturnType<typeof heldBooking>>, piId: string) {
  return {
    id: `evt_${randomUUID()}`,
    type: "checkout.session.completed",
    livemode: false,
    data: {
      object: {
        id: b.payment.sessionId,
        object: "checkout.session",
        payment_intent: piId,
        metadata: { reservation_id: b.hold.reservationId, payment_id: b.payment.id },
      },
    },
  } as unknown as Stripe.Event;
}

const reservation = async (id: string) =>
  (await dbMod.db()<{ status: string; confirmedAt: Date | null; cancellationReason: string | null }[]>`
    SELECT status, confirmed_at, cancellation_reason FROM reservations WHERE id = ${id}
  `)[0];
const payments = async (reservationId: string) =>
  dbMod.db()<{ kind: string; status: string; amountPence: number; dueDate: string | null; refundedPence: number }[]>`
    SELECT kind, status, amount_pence, due_date, refunded_pence FROM payments WHERE reservation_id = ${reservationId} ORDER BY created_at
  `;
const audits = async (reservationId: string, action: string) =>
  (await dbMod.db()<{ n: number }[]>`
    SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${reservationId} AND action = ${action}
  `)[0].n;

describe.runIf(enabled)("Stripe payments (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
    process.env.DIRECT_BOOKING_ENABLED = "true";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    balance = await import("@/lib/payments/balance");
  });
  beforeEach(() => {
    gateway = new FakeGateway();
  });
  afterAll(async () => {
    delete process.env.DIRECT_BOOKING_ENABLED;
    await dbMod?.db().end();
  });

  it("starting checkout records a pending deposit but confirms nothing", async () => {
    const b = await heldBooking("2035-03-01", "2035-03-04");
    expect(await payments(b.hold.reservationId)).toEqual([
      { kind: "DEPOSIT", status: "PENDING", amountPence: 22500, dueDate: null, refundedPence: 0 },
    ]);
    expect((await reservation(b.hold.reservationId)).status).toBe("HOLD");
  });

  it("confirms the booking and captures the deposit when Stripe confirms payment", async () => {
    const b = await heldBooking("2035-04-01", "2035-04-04");
    await webhook.handleStripeEvent(authorised(b), gateway);

    expect((await reservation(b.hold.reservationId)).status).toBe("CONFIRMED");
    expect(gateway.count("capture")).toBe(1);
    expect(await payments(b.hold.reservationId)).toEqual([
      { kind: "DEPOSIT", status: "SUCCEEDED", amountPence: 22500, dueDate: null, refundedPence: 0 },
      { kind: "BALANCE", status: "PENDING", amountPence: 22500, dueDate: "2035-03-25", refundedPence: 0 },
    ]);
  });

  it("ignores a duplicate delivery of the same event", async () => {
    const b = await heldBooking("2035-05-01", "2035-05-04");
    const event = authorised(b);
    await webhook.handleStripeEvent(event, gateway);
    const again = await webhook.handleStripeEvent(event, gateway);

    expect(again.duplicate).toBe(true);
    expect(gateway.count("capture")).toBe(1);
    expect(await audits(b.hold.reservationId, "reservation.confirmed")).toBe(1);
  });

  it("stays correct when Stripe delivers the confirmation twice at the same moment", async () => {
    const b = await heldBooking("2035-06-01", "2035-06-04");
    const first = authorised(b);
    const piId = (first.data.object as { payment_intent: string }).payment_intent;
    await Promise.all([
      webhook.handleStripeEvent(first, gateway),
      webhook.handleStripeEvent(completedEvent(b, piId), gateway),
    ]);

    expect((await reservation(b.hold.reservationId)).status).toBe("CONFIRMED");
    expect(await audits(b.hold.reservationId, "reservation.confirmed")).toBe(1);
    const p = await payments(b.hold.reservationId);
    expect(p.filter((x) => x.kind === "BALANCE")).toHaveLength(1);
    expect(p[0].status).toBe("SUCCEEDED");
    // Any second capture uses the same Stripe idempotency key, so it can't charge twice.
    expect(new Set(gateway.calls.filter((c) => c.method === "capture").map((c) => c.arg)).size).toBe(1);
  });

  it("still confirms a payment that arrives after the hold lapsed, if the dates are free", async () => {
    const b = await heldBooking("2035-07-01", "2035-07-04");
    await dbMod.db()`UPDATE reservations SET status = 'EXPIRED', hold_expires_at = now() - interval '1 minute' WHERE id = ${b.hold.reservationId}`;
    await webhook.handleStripeEvent(authorised(b), gateway);
    expect((await reservation(b.hold.reservationId)).status).toBe("CONFIRMED");
    expect(gateway.count("capture")).toBe(1);
  });

  it("releases the card authorisation, never charging, if the dates went to someone else", async () => {
    const b = await heldBooking("2035-08-01", "2035-08-04");
    await dbMod.db()`UPDATE reservations SET status = 'EXPIRED', hold_expires_at = now() - interval '1 minute' WHERE id = ${b.hold.reservationId}`;
    const other = await holds.createHold(b.property.id, { checkIn: "2035-08-02", checkOut: "2035-08-05", adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
    expect(other.ok).toBe(true);

    await webhook.handleStripeEvent(authorised(b), gateway);
    expect((await reservation(b.hold.reservationId)).status).toBe("EXPIRED");
    expect(gateway.count("capture")).toBe(0);
    expect(gateway.count("cancel")).toBe(1);
    expect((await payments(b.hold.reservationId))[0].status).toBe("CANCELLED");
  });

  it("refuses a payment for a different amount than the booking", async () => {
    const b = await heldBooking("2035-09-01", "2035-09-04");
    await webhook.handleStripeEvent(authorised(b, { amountCapturable: 100, amount: 100 }), gateway);
    expect((await reservation(b.hold.reservationId)).status).toBe("HOLD");
    expect(gateway.count("capture")).toBe(0);
    expect(gateway.count("cancel")).toBe(1);
    expect((await payments(b.hold.reservationId))[0].status).toBe("FAILED");
  });

  it("cancels the booking and frees the dates if the capture fails", async () => {
    const b = await heldBooking("2035-10-01", "2035-10-04");
    gateway.failCapture = true;
    await webhook.handleStripeEvent(authorised(b), gateway);
    expect(await reservation(b.hold.reservationId)).toMatchObject({ status: "CANCELLED", cancellationReason: "Payment could not be taken" });
    expect((await payments(b.hold.reservationId))[0].status).toBe("FAILED");
    const again = await holds.createHold(b.property.id, { checkIn: "2035-10-01", checkOut: "2035-10-04", adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
    expect(again.ok).toBe(true);
  });

  it("ignores checkouts that aren't ours (e.g. Lodgify's on the same Stripe account)", async () => {
    const event = {
      id: `evt_${randomUUID()}`,
      type: "checkout.session.completed",
      livemode: false,
      data: { object: { id: "cs_lodgify_123", object: "checkout.session", payment_intent: "pi_lodgify", metadata: {} } },
    } as unknown as Stripe.Event;
    expect(await webhook.handleStripeEvent(event, gateway)).toMatchObject({ ignored: "not one of our checkouts" });
    expect(gateway.calls).toEqual([]);
  });

  it("ignores live-mode events when running with test keys", async () => {
    const b = await heldBooking("2035-11-01", "2035-11-04");
    const event = { ...authorised(b), livemode: true } as Stripe.Event;
    expect(await webhook.handleStripeEvent(event, gateway)).toMatchObject({ ignored: "wrong mode" });
    expect((await reservation(b.hold.reservationId)).status).toBe("HOLD");
  });

  it("frees the hold early when the checkout expires unpaid", async () => {
    const b = await heldBooking("2035-12-01", "2035-12-04");
    await webhook.handleStripeEvent(
      {
        id: `evt_${randomUUID()}`,
        type: "checkout.session.expired",
        livemode: false,
        data: { object: { id: b.payment.sessionId, object: "checkout.session", metadata: { payment_id: b.payment.id } } },
      } as unknown as Stripe.Event,
      gateway
    );
    expect((await reservation(b.hold.reservationId)).status).toBe("EXPIRED");
    expect((await payments(b.hold.reservationId))[0].status).toBe("CANCELLED");
  });

  it("charges a due balance once, however often the job runs", async () => {
    const b = await heldBooking("2036-01-10", "2036-01-13");
    await webhook.handleStripeEvent(authorised(b), gateway);
    // Make the balance due now.
    await dbMod.db()`UPDATE payments SET due_date = '2000-01-01' WHERE reservation_id = ${b.hold.reservationId} AND kind = 'BALANCE'`;

    await balance.chargeDueBalances(gateway);
    await balance.chargeDueBalances(gateway);
    expect(gateway.count("chargeOffSession")).toBe(1);
    expect((await payments(b.hold.reservationId)).find((p) => p.kind === "BALANCE")?.status).toBe("SUCCEEDED");

    const [fin] = await dbMod.db()<{ paidPence: number; balancePence: number; paymentStatus: string }[]>`
      SELECT paid_pence, balance_pence, payment_status FROM reservation_financials WHERE reservation_id = ${b.hold.reservationId}
    `;
    expect(fin).toEqual({ paidPence: 45000, balancePence: 0, paymentStatus: "PAID" });
  });

  it("records a failed balance charge for follow-up, keeping the booking", async () => {
    const b = await heldBooking("2036-02-10", "2036-02-13");
    await webhook.handleStripeEvent(authorised(b), gateway);
    await dbMod.db()`UPDATE payments SET due_date = '2000-01-01' WHERE reservation_id = ${b.hold.reservationId} AND kind = 'BALANCE'`;
    gateway.chargeResult = "fail";
    await balance.chargeDueBalances(gateway);
    expect((await payments(b.hold.reservationId)).find((p) => p.kind === "BALANCE")?.status).toBe("FAILED");
    expect((await reservation(b.hold.reservationId)).status).toBe("CONFIRMED");
  });

  it("records refunds made in the Stripe dashboard", async () => {
    const b = await heldBooking("2036-03-10", "2036-03-13");
    const event = authorised(b);
    await webhook.handleStripeEvent(event, gateway);
    const piId = (event.data.object as { payment_intent: string }).payment_intent;
    await webhook.handleStripeEvent(
      {
        id: `evt_${randomUUID()}`,
        type: "charge.refunded",
        livemode: false,
        data: { object: { id: "ch_1", object: "charge", payment_intent: piId, amount_refunded: 10000 } },
      } as unknown as Stripe.Event,
      gateway
    );
    expect((await payments(b.hold.reservationId))[0].refundedPence).toBe(10000);
  });

  describe("webhook endpoint", () => {
    const stripe = new Stripe("sk_test_fake");
    const post = (payload: string, signature: string) =>
      import("@/app/api/stripe/webhook/route").then((m) =>
        m.POST(new Request("https://example.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": signature }, body: payload }))
      );

    it("rejects a request without a valid Stripe signature", async () => {
      const payload = JSON.stringify({ id: "evt_forged", type: "checkout.session.completed", livemode: false, data: { object: {} } });
      expect((await post(payload, "t=1,v1=forged")).status).toBe(400);
      const wrongSecret = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_someone_else" });
      expect((await post(payload, wrongSecret)).status).toBe(400);
    });

    it("accepts a correctly signed event", async () => {
      const payload = JSON.stringify({ id: `evt_${randomUUID()}`, object: "event", type: "customer.created", livemode: false, data: { object: {} } });
      const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: "whsec_test_secret" });
      const res = await post(payload, signature);
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ received: true });
    });
  });
});
