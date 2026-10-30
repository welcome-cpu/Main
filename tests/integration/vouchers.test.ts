// Gift Up voucher redemption against a real database (npm run
// test:integration). Gift Up's API is replaced by a fake fetch; Stripe by a
// minimal fake gateway.

import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentGateway, PaymentIntentInfo } from "@/lib/payments/gateway";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

let dbMod: typeof import("@/lib/db/client");
let holds: typeof import("@/lib/booking/holds");
let checkout: typeof import("@/lib/payments/checkout");
let webhook: typeof import("@/lib/payments/webhook");
let redemption: typeof import("@/lib/vouchers/redemption");

const guest = { firstName: "Gift", lastName: "Tester", email: "gift@example.com", phone: "07700 900002", country: null, message: null };

/** A pretend Gift Up: one voucher per code, with a balance in pence. */
class FakeGiftUp {
  balances = new Map<string, number>();
  redemptions = new Map<string, { code: string; pence: number; undone: boolean }>();
  calls: string[] = [];
  redeemStatus = 200;
  undoStatus = 200;

  fetch = async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const [, , rawCode, action] = url.pathname.split("/");
    const code = decodeURIComponent(rawCode);
    this.calls.push(`${init?.method ?? "GET"} ${action ?? "lookup"}`);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const reply = (status: number, json: unknown) => new Response(JSON.stringify(json), { status });

    if (!this.balances.has(code)) return reply(404, {});
    const balance = this.balances.get(code)!;
    if (!action) {
      return reply(200, { canBeRedeemed: balance > 0, isVoided: false, hasExpired: false, notYetValid: false, backingType: "Currency", remainingValue: balance / 100 });
    }
    if (action === "redeem") {
      if (this.redeemStatus !== 200) return reply(this.redeemStatus, { insufficientRemainingCredit: this.redeemStatus === 422 });
      const pence = Math.round(body.amount * 100);
      if (pence > balance) return reply(422, { insufficientRemainingCredit: true });
      this.balances.set(code, balance - pence);
      const transactionId = randomUUID();
      this.redemptions.set(transactionId, { code, pence, undone: false });
      return reply(200, { transactionId, redeemedAmount: body.amount, remainingCredit: (balance - pence) / 100 });
    }
    if (action === "undo-redemption") {
      if (this.undoStatus !== 200) return reply(this.undoStatus, {});
      const r = this.redemptions.get(body.transactionId)!;
      if (!r.undone) {
        r.undone = true;
        this.balances.set(code, balance + r.pence);
      }
      return reply(200, { amountReversed: r.pence / 100, alreadyReversed: false });
    }
    return reply(400, {});
  };
}

class FakeGateway implements Partial<PaymentGateway> {
  intents = new Map<string, PaymentIntentInfo>();
  cancelled: string[] = [];
  async createCheckout() {
    return { sessionId: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.test/pay" };
  }
  async expireCheckout() {}
  async retrievePaymentIntent(id: string) {
    return this.intents.get(id)!;
  }
  async capture(id: string) {
    const pi = this.intents.get(id)!;
    this.intents.set(id, { ...pi, status: "succeeded", amountReceived: pi.amountCapturable, amountCapturable: 0 });
    return { status: "succeeded" };
  }
  async cancel(id: string) {
    this.cancelled.push(id);
  }
}

let giftUp: FakeGiftUp;
let gateway: FakeGateway;

async function createProperty() {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence, pet_fee_pence,
      default_min_nights, deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, 'Voucher test', true, 4, 2, 15000, 4000, 2, 50, 7, 3650, 0)
    RETURNING id
  `;
  return { id, slug };
}

/** A hold paid partly or wholly by a voucher, redeemed as the hold endpoint does. */
async function voucherHold(checkIn: string, checkOut: string, voucherPence: number) {
  const code = `GIFT-${randomUUID().slice(0, 6).toUpperCase()}`;
  giftUp.balances.set(code, voucherPence);
  const p = await createProperty();
  const hold = await holds.createHold(
    p.id,
    { checkIn, checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null, voucher: { code, availablePence: voucherPence } },
    guest,
    { ip: null }
  );
  if (!hold.ok) throw new Error("expected a hold");
  return { property: p, hold, code };
}

const voucherPayment = async (reservationId: string) =>
  (await dbMod.db()<{ status: string; amountPence: number; giftupTransactionId: string | null; voucherReversedAt: Date | null; failureCode: string | null }[]>`
    SELECT status, amount_pence, giftup_transaction_id, voucher_reversed_at, failure_code FROM payments
    WHERE reservation_id = ${reservationId} AND kind = 'VOUCHER'
  `)[0];
const reservationStatus = async (id: string) =>
  (await dbMod.db()<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${id}`)[0].status;

/** Stripe authorised the card for the rest; returns the checkout.session.completed event. */
async function cardAuthorised(reservationId: string) {
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments
    WHERE reservation_id = ${reservationId} AND kind IN ('DEPOSIT', 'FULL')
  `;
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  gateway.intents.set(piId, {
    id: piId,
    status: "requires_capture",
    amount: payment.amountPence,
    amountCapturable: payment.amountPence,
    amountReceived: 0,
    currency: "GBP",
    customerId: "cus_test",
    paymentMethodId: "pm_test",
    metadata: {},
  });
  return {
    id: `evt_${randomUUID()}`,
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { id: payment.sessionId, object: "checkout.session", payment_intent: piId, metadata: { reservation_id: reservationId, payment_id: payment.id } } },
  } as unknown as Stripe.Event;
}

describe.runIf(enabled)("Gift Up vouchers (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    process.env.GIFTUP_API_KEY = "giftup_test_key";
    process.env.DIRECT_BOOKING_ENABLED = "true";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    redemption = await import("@/lib/vouchers/redemption");
  });
  beforeEach(() => {
    giftUp = new FakeGiftUp();
    gateway = new FakeGateway();
    vi.stubGlobal("fetch", giftUp.fetch);
  });
  // Don't leave emails queued for the email tests' senders.
  afterEach(async () => {
    await dbMod.db()`
      DELETE FROM emails WHERE reservation_id IN (
        SELECT r.id FROM reservations r JOIN properties p ON p.id = r.property_id WHERE p.name = 'Voucher test'
      )
    `;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    delete process.env.DIRECT_BOOKING_ENABLED;
    delete process.env.GIFTUP_API_KEY;
    await dbMod?.db().end();
  });

  it("looks a voucher up without spending it", async () => {
    const { lookupVoucher } = await import("@/lib/vouchers/giftup");
    giftUp.balances.set("GIFT-LOOK", 5000);
    expect(await lookupVoucher(" gift-look ")).toEqual({ ok: true, code: "GIFT-LOOK", availablePence: 5000 });
    expect((await lookupVoucher("GIFT-NONE")).ok).toBe(false);
    expect(giftUp.balances.get("GIFT-LOOK")).toBe(5000);
  });

  it("takes part of the price from the voucher and the rest by card, with no balance later", async () => {
    const b = await voucherHold("2036-03-01", "2036-03-04", 10000);
    expect(b.hold.quote.dueNowPence).toBe(35000);

    expect(await redemption.redeemHoldVoucher(b.hold)).toEqual({ ok: true });
    expect(giftUp.balances.get(b.code)).toBe(0);
    expect((await voucherPayment(b.hold.reservationId)).status).toBe("AUTHORISED");

    const started = await checkout.startCheckout(gateway as unknown as PaymentGateway, b.hold, {
      propertyName: "Voucher test",
      guestEmail: guest.email,
      origin: "https://example.test",
      slug: b.property.slug,
    });
    expect(started.ok).toBe(true);
    await webhook.handleStripeEvent(await cardAuthorised(b.hold.reservationId), gateway as unknown as PaymentGateway);

    expect(await reservationStatus(b.hold.reservationId)).toBe("CONFIRMED");
    const rows = await dbMod.db()<{ kind: string; status: string; amountPence: number }[]>`
      SELECT kind, status, amount_pence FROM payments WHERE reservation_id = ${b.hold.reservationId} ORDER BY kind
    `;
    expect(rows).toEqual([
      { kind: "FULL", status: "SUCCEEDED", amountPence: 35000 },
      { kind: "VOUCHER", status: "SUCCEEDED", amountPence: 10000 },
    ]);
    const [fin] = await dbMod.db()<{ balancePence: number; paymentStatus: string }[]>`
      SELECT balance_pence, payment_status FROM reservation_financials WHERE reservation_id = ${b.hold.reservationId}
    `;
    expect(fin).toEqual({ balancePence: 0, paymentStatus: "PAID" });
  });

  it("confirms a booking the voucher pays for in full, without Stripe", async () => {
    const b = await voucherHold("2036-04-01", "2036-04-04", 100000);
    expect(b.hold.quote.dueNowPence).toBe(0);
    await redemption.redeemHoldVoucher(b.hold);

    expect(await redemption.confirmVoucherOnlyBooking(b.hold.reservationId)).toBe(true);
    expect(await reservationStatus(b.hold.reservationId)).toBe("CONFIRMED");
    expect((await voucherPayment(b.hold.reservationId)).status).toBe("SUCCEEDED");
    expect(giftUp.balances.get(b.code)).toBe(100000 - 45000);
    const [{ n }] = await dbMod.db()<{ n: number }[]>`
      SELECT count(*)::int AS n FROM emails WHERE reservation_id = ${b.hold.reservationId} AND kind = 'BOOKING_CONFIRMED'
    `;
    expect(n).toBe(1);
  });

  it("releases the hold when Gift Up refuses the voucher", async () => {
    const b = await voucherHold("2036-05-01", "2036-05-04", 10000);
    giftUp.redeemStatus = 422;

    const outcome = await redemption.redeemHoldVoucher(b.hold);
    expect(outcome.ok).toBe(false);
    expect(await reservationStatus(b.hold.reservationId)).toBe("EXPIRED");
    expect(await voucherPayment(b.hold.reservationId)).toMatchObject({ status: "FAILED", failureCode: "giftup_refused" });
  });

  it("flags an unclear Gift Up answer for the owner to check", async () => {
    const b = await voucherHold("2036-05-10", "2036-05-13", 10000);
    giftUp.redeemStatus = 500;

    expect((await redemption.redeemHoldVoucher(b.hold)).ok).toBe(false);
    expect(await voucherPayment(b.hold.reservationId)).toMatchObject({ status: "FAILED", failureCode: "giftup_unknown" });
    const { needsAttention } = await import("@/lib/admin/bookings");
    const attention = await needsAttention();
    expect(attention.voucherProblems.some((v) => v.reservationId === b.hold.reservationId)).toBe(true);
  });

  it("gives the voucher back when the guest releases the hold", async () => {
    const b = await voucherHold("2036-06-01", "2036-06-04", 10000);
    await redemption.redeemHoldVoucher(b.hold);
    expect(await holds.releaseHold(b.hold.reservationId, b.hold.accessToken)).toBe(true);

    expect(await redemption.reverseAbandonedVouchers()).toMatchObject({ reversed: 1, failed: 0 });
    expect(giftUp.balances.get(b.code)).toBe(10000);
    expect((await voucherPayment(b.hold.reservationId)).voucherReversedAt).not.toBeNull();
    // Nothing left to do on the next run.
    await redemption.reverseAbandonedVouchers();
    expect(giftUp.calls.filter((c) => c.endsWith("undo-redemption"))).toHaveLength(1);
  });

  it("retries giving a voucher back if Gift Up fails the first time", async () => {
    const b = await voucherHold("2036-07-01", "2036-07-04", 10000);
    await redemption.redeemHoldVoucher(b.hold);
    await holds.releaseHold(b.hold.reservationId, b.hold.accessToken);

    giftUp.undoStatus = 503;
    expect((await redemption.reverseAbandonedVouchers()).failed).toBeGreaterThanOrEqual(1);
    expect(giftUp.balances.get(b.code)).toBe(0);

    giftUp.undoStatus = 200;
    await redemption.reverseAbandonedVouchers();
    expect(giftUp.balances.get(b.code)).toBe(10000);
  });

  it("refuses a late card payment once the voucher has been given back", async () => {
    const b = await voucherHold("2036-08-01", "2036-08-04", 10000);
    await redemption.redeemHoldVoucher(b.hold);
    await checkout.startCheckout(gateway as unknown as PaymentGateway, b.hold, {
      propertyName: "Voucher test",
      guestEmail: guest.email,
      origin: "https://example.test",
      slug: b.property.slug,
    });
    // The hold lapsed long ago and the clean-up job has run.
    await dbMod.db()`UPDATE reservations SET hold_expires_at = now() - interval '1 hour' WHERE id = ${b.hold.reservationId}`;
    await redemption.reverseAbandonedVouchers();
    expect(giftUp.balances.get(b.code)).toBe(10000);

    const event = await cardAuthorised(b.hold.reservationId);
    await webhook.handleStripeEvent(event, gateway as unknown as PaymentGateway);
    expect(await reservationStatus(b.hold.reservationId)).not.toBe("CONFIRMED");
    expect(gateway.cancelled).toHaveLength(1);
  });
});
