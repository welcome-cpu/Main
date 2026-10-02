// Booking emails against a real database (npm run test:integration):
// queued exactly once with the booking change, sent exactly once.

import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PaymentGateway, PaymentIntentInfo } from "@/lib/payments/gateway";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");

let dbMod: Db;
let holds: typeof import("@/lib/booking/holds");
let checkout: typeof import("@/lib/payments/checkout");
let webhook: typeof import("@/lib/payments/webhook");
let balance: typeof import("@/lib/payments/balance");
let outbox: typeof import("@/lib/email/outbox");

const guest = { firstName: "Mail", lastName: "Tester", email: "mail@example.com", phone: "07700 900002", country: null, message: "<b>hi</b>" };

function gateway(opts: { failCapture?: boolean; chargeFails?: boolean } = {}): PaymentGateway & { intents: Map<string, PaymentIntentInfo> } {
  const intents = new Map<string, PaymentIntentInfo>();
  return {
    intents,
    async createCheckout() {
      return { sessionId: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.test" };
    },
    async expireCheckout() {},
    async checkoutUrl() {
      return null;
    },
    async retrievePaymentIntent(id) {
      return intents.get(id)!;
    },
    async capture(id) {
      if (opts.failCapture) throw new Error("declined");
      const pi = intents.get(id)!;
      intents.set(id, { ...pi, status: "succeeded", amountReceived: pi.amountCapturable });
      return { status: "succeeded" };
    },
    async cancel() {},
    async chargeOffSession(c) {
      return opts.chargeFails
        ? { ok: false, paymentIntentId: null, code: "card_declined", message: "Declined" }
        : { ok: true, paymentIntentId: `pi_bal_${c.paymentId}`, status: "succeeded" };
    },
    parseWebhook(): Stripe.Event {
      throw new Error("unused");
    },
  };
}

async function paidBooking(checkIn: string, checkOut: string, g = gateway()) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id: propertyId }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, base_nightly_pence, default_min_nights,
      deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, 'Email test', true, 4, 15000, 2, 50, 7, 5000, 0) RETURNING id
  `;
  const hold = await holds.createHold(propertyId, { checkIn, checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
  if (!hold.ok) throw new Error("hold");
  await checkout.startCheckout(g, hold, { propertyName: "Email test", guestEmail: guest.email, origin: "https://example.test", slug });
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments WHERE reservation_id = ${hold.reservationId}
  `;
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  g.intents.set(piId, { id: piId, status: "requires_capture", amount: payment.amountPence, amountCapturable: payment.amountPence, amountReceived: 0, currency: "GBP", customerId: "cus_x", paymentMethodId: "pm_x", metadata: {} });
  const event = {
    id: `evt_${randomUUID()}`,
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: payment.sessionId, payment_intent: piId, metadata: { payment_id: payment.id } } },
  } as unknown as Stripe.Event;
  return { reservationId: hold.reservationId, event, g, propertyId };
}

const emailsFor = (reservationId: string) =>
  dbMod.db()<{ kind: string; recipient: string; subject: string; status: string; replyTo: string | null }[]>`
    SELECT kind, recipient, subject, status, reply_to FROM emails WHERE reservation_id = ${reservationId} ORDER BY kind
  `;

describe.runIf(enabled)("booking emails (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.CONTACT_MAILBOX = "owner@example.com";
    delete process.env.VERCEL_ENV;
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    balance = await import("@/lib/payments/balance");
    outbox = await import("@/lib/email/outbox");
    // Start from an empty queue so these tests only see their own emails.
    await dbMod.db()`UPDATE emails SET status = 'SENT' WHERE status <> 'SENT'`;
  });
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("queues the guest confirmation and owner notification once payment is taken, even if Stripe repeats itself", async () => {
    const b = await paidBooking("2037-03-01", "2037-03-04");
    await webhook.handleStripeEvent(b.event, b.g);
    await webhook.handleStripeEvent({ ...b.event, id: `evt_${randomUUID()}` } as Stripe.Event, b.g);

    const emails = await emailsFor(b.reservationId);
    expect(emails.map((e) => [e.kind, e.recipient])).toEqual([
      ["BOOKING_CONFIRMED", "mail@example.com"],
      ["OWNER_NEW_BOOKING", "owner@example.com"],
    ]);
    expect(emails.every((e) => e.subject.startsWith("[TEST] "))).toBe(true);
    // Replying to the owner notification goes to the guest.
    expect(emails[1].replyTo).toBe("mail@example.com");
  });

  it("tells the guest they weren't charged when the capture fails", async () => {
    const b = await paidBooking("2037-04-01", "2037-04-04", gateway({ failCapture: true }));
    await webhook.handleStripeEvent(b.event, b.g);
    expect((await emailsFor(b.reservationId)).map((e) => e.kind)).toEqual(["NOT_CHARGED", "OWNER_PAYMENT_PROBLEM"]);
  });

  it("sends a receipt when the balance is charged, and a request when it fails", async () => {
    const ok = await paidBooking("2037-05-01", "2037-05-04");
    await webhook.handleStripeEvent(ok.event, ok.g);
    await dbMod.db()`UPDATE payments SET due_date = '2000-01-01' WHERE reservation_id = ${ok.reservationId} AND kind = 'BALANCE'`;
    await balance.chargeDueBalances(ok.g);
    expect((await emailsFor(ok.reservationId)).map((e) => e.kind)).toContain("BALANCE_RECEIVED");

    const bad = await paidBooking("2037-06-01", "2037-06-04", gateway({ chargeFails: true }));
    await webhook.handleStripeEvent(bad.event, bad.g);
    await dbMod.db()`UPDATE payments SET due_date = '2000-01-01' WHERE reservation_id = ${bad.reservationId} AND kind = 'BALANCE'`;
    await balance.chargeDueBalances(bad.g);
    const kinds = (await emailsFor(bad.reservationId)).map((e) => e.kind);
    expect(kinds).toContain("BALANCE_FAILED");
    expect(kinds.filter((k) => k === "OWNER_PAYMENT_PROBLEM")).toHaveLength(1);
  });

  it("sends each queued email exactly once, even with two senders running at once", async () => {
    const b = await paidBooking("2037-07-01", "2037-07-04");
    await webhook.handleStripeEvent(b.event, b.g);
    const [{ reference }] = await dbMod.db()<{ reference: string }[]>`SELECT reference FROM reservations WHERE id = ${b.reservationId}`;

    const sent: string[] = [];
    const send = async (m: { to: string; subject: string }) => {
      await new Promise((r) => setTimeout(r, 50));
      sent.push(`${m.to}|${m.subject}`);
    };
    await Promise.all([outbox.processOutbox({ send }), outbox.processOutbox({ send })]);

    const mine = sent.filter((s) => s.includes(reference));
    expect(mine).toHaveLength(2);
    expect(new Set(mine).size).toBe(2);
    expect((await emailsFor(b.reservationId)).every((e) => e.status === "SENT")).toBe(true);

    await outbox.processOutbox({ send });
    expect(sent.filter((s) => s.includes(reference))).toHaveLength(2);
  });

  it("keeps a failed email and retries it later", async () => {
    const b = await paidBooking("2037-08-01", "2037-08-04");
    await webhook.handleStripeEvent(b.event, b.g);
    await outbox.processOutbox({ send: async () => Promise.reject(new Error("mailbox unavailable")) });

    const [row] = await dbMod.db()<{ status: string; attempts: number; lastError: string; retryInFuture: boolean }[]>`
      SELECT status, attempts, last_error, next_attempt_at > now() AS retry_in_future
      FROM emails WHERE reservation_id = ${b.reservationId} AND kind = 'BOOKING_CONFIRMED'
    `;
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastError: "mailbox unavailable", retryInFuture: true });
  });
});
