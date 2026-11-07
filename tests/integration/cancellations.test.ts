import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentGateway, PaymentIntentInfo, RefundRequest } from "@/lib/payments/gateway";

// Runs against the test database. Stripe and Lodgify are fakes, so nothing
// here can reach a real payment or the real calendar.
const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL);

let dbMod: typeof import("@/lib/db/client");
let holds: typeof import("@/lib/booking/holds");
let checkout: typeof import("@/lib/payments/checkout");
let webhook: typeof import("@/lib/payments/webhook");
let cancellations: typeof import("@/lib/admin/cancellations");
let terms: typeof import("@/lib/booking/terms");

const admin = { id: randomUUID(), email: "owner@example.com", displayName: null, role: "OWNER" as const };
const guest = { firstName: "Refund", lastName: "Testguest", email: "refund-test@example.com", phone: "07700 900004", country: null, message: null };

function gateway() {
  const intents = new Map<string, PaymentIntentInfo>();
  const g = {
    intents,
    refunds: [] as RefundRequest[],
    failRefunds: false,
    async createCheckout() {
      return { sessionId: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.test" };
    },
    async expireCheckout() {},
    async checkoutUrl() {
      return null;
    },
    async retrievePaymentIntent(id: string) {
      return intents.get(id)!;
    },
    async capture(id: string) {
      const pi = intents.get(id)!;
      intents.set(id, { ...pi, status: "succeeded", amountReceived: pi.amountCapturable });
      return { status: "succeeded" };
    },
    async cancel() {},
    async chargeOffSession() {
      return { ok: false as const, paymentIntentId: null, code: "unused", message: "unused" };
    },
    async refund(r: RefundRequest) {
      if (g.failRefunds) throw new Error("Stripe said no");
      g.refunds.push(r);
      return { refundId: `re_${g.refunds.length}` };
    },
    parseWebhook(): Stripe.Event {
      throw new Error("unused");
    },
  };
  return g satisfies PaymentGateway;
}

const DAY = 86_400_000;
const arrival = "2039-06-30";
const beforeArrival = (days: number) => new Date(Date.parse(`${arrival}T11:00:00Z`) - days * DAY);

/** A confirmed booking: £450 total, £225 deposit paid by card, balance pending. */
async function confirmedBooking(g: ReturnType<typeof gateway>, checkIn = arrival) {
  const checkOut = new Date(Date.parse(`${checkIn}T00:00:00Z`) + 3 * DAY).toISOString().slice(0, 10);
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id: propertyId }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, base_nightly_pence, default_min_nights,
      deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, ${"Refund " + slug}, true, 4, 15000, 2, 50, 7, 6000, 0) RETURNING id
  `;
  const hold = await holds.createHold(propertyId, { checkIn, checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
  if (!hold.ok) throw new Error("hold");
  await checkout.startCheckout(g, hold, { propertyName: "Refund test", guestEmail: guest.email, origin: "https://example.test", slug });
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments WHERE reservation_id = ${hold.reservationId}
  `;
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  g.intents.set(piId, { id: piId, status: "requires_capture", amount: payment.amountPence, amountCapturable: payment.amountPence, amountReceived: 0, currency: "GBP", customerId: "cus_x", paymentMethodId: "pm_x", metadata: {} });
  await webhook.handleStripeEvent(
    { id: `evt_${randomUUID()}`, type: "checkout.session.completed", livemode: false, data: { object: { id: payment.sessionId, payment_intent: piId, metadata: { payment_id: payment.id } } } } as unknown as Stripe.Event,
    g
  );
  // Booked under the new policy, whatever today's date is.
  await dbMod.db()`UPDATE reservations SET created_at = ${new Date(terms.NEW_TERMS_FROM.getTime() + 1000)} WHERE id = ${hold.reservationId}`;
  return { id: hold.reservationId, propertyId, piId, paymentId: payment.id, checkIn, checkOut };
}

const cancel = (g: ReturnType<typeof gateway>, id: string, approvedRefundPence: number, now: Date) =>
  cancellations.cancelBookingWithRefund(admin, id, { reason: "Guest asked", emailGuest: true, approvedRefundPence }, { gateway: g, paymentsReady: true, now });

const statusOf = async (id: string) => (await dbMod.db()<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${id}`)[0].status;
const cancelEmail = async (id: string) =>
  (await dbMod.db()<{ textBody: string }[]>`SELECT text_body FROM emails WHERE reservation_id = ${id} AND kind = 'BOOKING_CANCELLED'`)[0]?.textBody;

describe.runIf(enabled)("cancelling with a refund (database)", () => {
  let lodgifyCalls: { url: string; method?: string }[];
  let lodgifyStatus: number;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    cancellations = await import("@/lib/admin/cancellations");
    terms = await import("@/lib/booking/terms");
  });
  beforeEach(() => {
    lodgifyCalls = [];
    lodgifyStatus = 200;
    vi.stubEnv("LODGIFY_BOOKING_PUSH", "on");
    vi.stubEnv("LODGIFY_API_KEY", "fake-key");
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      lodgifyCalls.push({ url: String(input), method: init?.method });
      return new Response("", { status: lodgifyStatus });
    });
  });
  // Other test files send whatever is queued in this shared database, so
  // nothing is left waiting for them.
  afterEach(async () => {
    await dbMod.db()`
      DELETE FROM emails WHERE reservation_id IN (
        SELECT r.id FROM reservations r JOIN guests g ON g.id = r.guest_id WHERE g.email = ${guest.email}
      )
    `;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await dbMod?.db().end();
  });

  it("shows the refund first and changes nothing until it's approved", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const preview = await cancellations.previewCancellation(b.id, beforeArrival(40));
    expect(preview).toMatchObject({ rule: "FULL", daysBefore: 40, totalPence: 45000, paidPence: 22500, refundPence: 22500, cardPence: 22500 });
    expect(await statusOf(b.id)).toBe("CONFIRMED");
    expect(g.refunds).toEqual([]);
  });

  it("at 30+ days refunds what's been paid, frees the dates, calls off the balance and emails the guest", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    expect((await cancel(g, b.id, 22500, beforeArrival(30))).error).toBeUndefined();

    expect(g.refunds).toEqual([expect.objectContaining({ paymentIntentId: b.piId, amountPence: 22500 })]);
    expect(await statusOf(b.id)).toBe("CANCELLED");
    const payments = await dbMod.db()<{ kind: string; status: string; refundedPence: number }[]>`
      SELECT kind, status, refunded_pence FROM payments WHERE reservation_id = ${b.id} ORDER BY created_at
    `;
    expect(payments).toEqual([
      { kind: "DEPOSIT", status: "SUCCEEDED", refundedPence: 22500 },
      { kind: "BALANCE", status: "CANCELLED", refundedPence: 0 },
    ]);
    expect(await cancelEmail(b.id)).toContain("We've refunded £225.00 to the card you paid with.");
    expect(await cancellations.getCancellationRecord(b.id)).toMatchObject({ status: "DONE", rule: "FULL", refundPence: 22500, approvedBy: admin.email });

    const again = await holds.createHold(b.propertyId, { checkIn: b.checkIn, checkOut: b.checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
    expect(again.ok).toBe(true);
  });

  it("at 7 days refunds 50% of the total, capped at what's been paid", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    // 50% of £450 is £225, which is exactly the deposit paid.
    expect((await cancellations.previewCancellation(b.id, beforeArrival(7)))?.refundPence).toBe(22500);
    await dbMod.db()`UPDATE payments SET amount_pence = 10000 WHERE id = ${b.paymentId}`;
    expect(await cancellations.previewCancellation(b.id, beforeArrival(7))).toMatchObject({ rule: "HALF_OF_TOTAL", paidPence: 10000, refundPence: 10000 });
    await cancel(g, b.id, 10000, beforeArrival(7));
    expect(g.refunds[0].amountPence).toBe(10000);
  });

  it("under 7 days cancels with no refund, and says so", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    expect((await cancel(g, b.id, 0, beforeArrival(6))).error).toBeUndefined();
    expect(g.refunds).toEqual([]);
    expect(await statusOf(b.id)).toBe("CANCELLED");
    expect(await cancelEmail(b.id)).toContain("no refund is due");
  });

  it("uses the terms from the day a moved booking moved", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    await dbMod.db()`UPDATE reservations SET moved_at = ${new Date("2039-03-01T12:00:00Z")}, arrival_when_moved = '2039-03-10' WHERE id = ${b.id}`;
    // Nine days before the old arrival when it moved, though 40 before the new one.
    expect(await cancellations.previewCancellation(b.id, beforeArrival(40))).toMatchObject({ rule: "HALF_OF_TOTAL", daysBefore: 9, moved: true });
  });

  it("refuses if the refund no longer matches what was approved, and changes nothing", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const result = await cancel(g, b.id, 22500, beforeArrival(6));
    expect(result.error).toMatch(/changed/);
    expect(await statusOf(b.id)).toBe("CONFIRMED");
    expect(g.refunds).toEqual([]);
  });

  it("refuses a card refund where Stripe isn't set up, and changes nothing", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const result = await cancellations.cancelBookingWithRefund(admin, b.id, { reason: "x", emailGuest: false, approvedRefundPence: 22500 }, { gateway: g, paymentsReady: false, now: beforeArrival(40) });
    expect(result.error).toMatch(/Stripe/);
    expect(await statusOf(b.id)).toBe("CONFIRMED");
  });

  it("keeps a failed refund to retry, holding the email back, and can't refund twice", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    g.failRefunds = true;
    const failed = await cancel(g, b.id, 22500, beforeArrival(40));
    expect(failed.refundError).toBe("Stripe said no");
    expect(await statusOf(b.id)).toBe("CANCELLED");
    expect(await cancelEmail(b.id)).toBeUndefined();
    expect(await cancellations.getCancellationRecord(b.id)).toMatchObject({ status: "FAILED", failureMessage: "Stripe said no" });

    g.failRefunds = false;
    expect(await cancellations.retryCancellationRefund(admin, b.id, g)).toEqual({});
    expect(g.refunds).toHaveLength(1);
    expect(await cancelEmail(b.id)).toContain("£225.00");

    expect((await cancellations.retryCancellationRefund(admin, b.id, g)).error).toBeDefined();
    expect(g.refunds).toHaveLength(1);
    expect((await cancel(g, b.id, 22500, beforeArrival(40))).error).toBeDefined();
    expect(g.refunds).toHaveLength(1);
  });

  it("counts a refund once, whichever of Stripe's webhook and our own update comes first", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    await cancel(g, b.id, 22500, beforeArrival(40));
    await webhook.handleStripeEvent(
      { id: `evt_${randomUUID()}`, type: "charge.refunded", livemode: false, data: { object: { id: "ch_1", object: "charge", payment_intent: b.piId, amount_refunded: 22500 } } } as unknown as Stripe.Event,
      g
    );
    const [p] = await dbMod.db()<{ refundedPence: number }[]>`SELECT refunded_pence FROM payments WHERE id = ${b.paymentId}`;
    expect(p.refundedPence).toBe(22500);
  });

  describe("Lodgify", () => {
    const linked = async (g: ReturnType<typeof gateway>) => {
      const b = await confirmedBooking(g);
      await dbMod.db()`UPDATE reservations SET lodgify_booking_id = ${Math.floor(Math.random() * 1e9)}, lodgify_push_status = 'PUSHED' WHERE id = ${b.id}`;
      return b;
    };
    const lodgifyState = async (id: string) =>
      (await dbMod.db()<{ lodgifyCancelStatus: string | null; lodgifyCancelError: string | null }[]>`SELECT lodgify_cancel_status, lodgify_cancel_error FROM reservations WHERE id = ${id}`)[0];

    it("declines the booking so its dates free up on the channels", async () => {
      const g = gateway();
      const b = await linked(g);
      const result = await cancel(g, b.id, 22500, beforeArrival(40));
      expect(result.lodgify).toBe("DONE");
      expect(lodgifyCalls).toEqual([expect.objectContaining({ method: "PUT", url: expect.stringMatching(/\/v1\/reservation\/booking\/\d+\/decline$/) })]);
    });

    it("flags a refusal for the owner, without undoing the cancellation or refund", async () => {
      const g = gateway();
      const b = await linked(g);
      lodgifyStatus = 500;
      expect((await cancel(g, b.id, 22500, beforeArrival(40))).lodgify).toBe("FAILED");
      expect(g.refunds).toHaveLength(1);
      expect(await lodgifyState(b.id)).toMatchObject({ lodgifyCancelStatus: "FAILED", lodgifyCancelError: expect.stringContaining("HTTP 500") });
    });

    it("doesn't call Lodgify when sending to it is off, and says to do it by hand", async () => {
      vi.stubEnv("LODGIFY_BOOKING_PUSH", "");
      const g = gateway();
      const b = await linked(g);
      expect((await cancel(g, b.id, 22500, beforeArrival(40))).lodgify).toBe("NOT_SENT");
      expect(lodgifyCalls).toEqual([]);
    });

    it("leaves a booking that never went to Lodgify alone", async () => {
      const g = gateway();
      const b = await confirmedBooking(g);
      expect((await cancel(g, b.id, 22500, beforeArrival(40))).lodgify).toBeNull();
      expect(lodgifyCalls).toEqual([]);
    });
  });
});
