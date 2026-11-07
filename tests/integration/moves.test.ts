import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { OffSessionCharge, PaymentGateway, PaymentIntentInfo } from "@/lib/payments/gateway";

// Runs against the test database. Stripe and Lodgify are fakes, so nothing
// here can reach a real payment or the real calendar.
const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL);

let dbMod: typeof import("@/lib/db/client");
let holds: typeof import("@/lib/booking/holds");
let checkout: typeof import("@/lib/payments/checkout");
let webhook: typeof import("@/lib/payments/webhook");
let moves: typeof import("@/lib/admin/moves");
let cancellations: typeof import("@/lib/admin/cancellations");
let bookings: typeof import("@/lib/admin/bookings");
let balance: typeof import("@/lib/payments/balance");
let terms: typeof import("@/lib/booking/terms");

const admin = { id: randomUUID(), email: "owner@example.com", displayName: null, role: "OWNER" as const };
const guest = { firstName: "Move", lastName: "Testguest", email: "move-test@example.com", phone: "07700 900006", country: null, message: null };

function gateway() {
  const intents = new Map<string, PaymentIntentInfo>();
  const g = {
    intents,
    charges: [] as OffSessionCharge[],
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
    async chargeOffSession(c: OffSessionCharge) {
      g.charges.push(c);
      return { ok: true as const, paymentIntentId: `pi_off_${g.charges.length}_${randomUUID().slice(0, 8)}`, status: "succeeded" };
    },
    async refund() {
      return { refundId: "re_1" };
    },
    parseWebhook(): Stripe.Event {
      throw new Error("unused");
    },
  };
  return g satisfies PaymentGateway;
}

const DAY = 86_400_000;
const arrival = "2039-06-30";
/** 11:00 UTC: noon in the UK in summer, before the 4pm check-in. */
const beforeArrival = (days: number) => new Date(Date.parse(`${arrival}T11:00:00Z`) - days * DAY);
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** A confirmed booking: 3 nights at £150 = £450, £225 deposit paid by card, balance pending. */
async function confirmedBooking(g: ReturnType<typeof gateway>) {
  const checkIn = arrival;
  const checkOut = plusDays(checkIn, 3);
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id: propertyId }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, base_nightly_pence, default_min_nights,
      deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, ${"Move " + slug}, true, 4, 15000, 2, 50, 7, 6000, 0) RETURNING id
  `;
  const hold = await holds.createHold(propertyId, { checkIn, checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
  if (!hold.ok) throw new Error("hold");
  await checkout.startCheckout(g, hold, { propertyName: "Move test", guestEmail: guest.email, origin: "https://example.test", slug });
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments WHERE reservation_id = ${hold.reservationId}
  `;
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  g.intents.set(piId, { id: piId, status: "requires_capture", amount: payment.amountPence, amountCapturable: payment.amountPence, amountReceived: 0, currency: "GBP", customerId: "cus_x", paymentMethodId: "pm_x", metadata: {} });
  await webhook.handleStripeEvent(
    { id: `evt_${randomUUID()}`, type: "checkout.session.completed", livemode: false, data: { object: { id: payment.sessionId, payment_intent: piId, metadata: { payment_id: payment.id } } } } as unknown as Stripe.Event,
    g
  );
  await dbMod.db()`UPDATE reservations SET created_at = ${new Date(terms.NEW_TERMS_FROM.getTime() + 1000)}, lodgify_booking_id = NULL WHERE id = ${hold.reservationId}`;
  return { id: hold.reservationId, propertyId, checkIn, checkOut };
}

/** Nights from `from` (inclusive) to `to` (exclusive) priced at `pence`. */
const priceNights = (propertyId: string, from: string, to: string, pence: number) =>
  dbMod.db()`INSERT INTO rate_rules (property_id, name, nights, price_pence) VALUES (${propertyId}, 'test', daterange(${from}::date, ${to}::date, '[)'), ${pence})`;

async function move(id: string, checkIn: string, checkOut: string, now: Date, override: Partial<{ approvedTotalPence: number; approvedOwedPence: number }> = {}) {
  const preview = await moves.previewMove(id, checkIn, checkOut, now);
  if (!preview.ok) return { preview, result: null };
  const result = await moves.moveBooking(
    admin,
    id,
    { checkIn, checkOut, reason: "Guest asked", emailGuest: true, approvedTotalPence: preview.preview.newTotalPence, approvedOwedPence: preview.preview.plan.owedPence, ...override },
    { now }
  );
  return { preview, result };
}

const reservation = async (id: string) =>
  (await dbMod.db()<{ checkIn: string; checkOut: string; totalPence: number; movedAt: Date | null; arrivalWhenMoved: string | null; status: string }[]>`
    SELECT check_in::text, check_out::text, total_pence, moved_at, arrival_when_moved::text, status FROM reservations WHERE id = ${id}
  `)[0];
const balances = (id: string) =>
  dbMod.db()<{ id: string; status: string; amountPence: number; dueDate: string; customerId: string | null }[]>`
    SELECT id, status, amount_pence, due_date::text, stripe_customer_id AS customer_id FROM payments WHERE reservation_id = ${id} AND kind = 'BALANCE' ORDER BY created_at
  `;
const movedEmail = async (id: string) =>
  (await dbMod.db()<{ textBody: string }[]>`SELECT text_body FROM emails WHERE reservation_id = ${id} AND kind = 'BOOKING_MOVED'`)[0]?.textBody;

describe.runIf(enabled)("moving a booking (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    moves = await import("@/lib/admin/moves");
    cancellations = await import("@/lib/admin/cancellations");
    bookings = await import("@/lib/admin/bookings");
    balance = await import("@/lib/payments/balance");
    terms = await import("@/lib/booking/terms");
  });
  beforeEach(() => {
    // Lodgify must never be reached from here.
    vi.stubEnv("LODGIFY_BOOKING_PUSH", "");
    vi.stubEnv("LODGIFY_API_KEY", "");
    vi.stubGlobal("fetch", async () => new Response("", { status: 500 }));
  });
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

  it("previews without changing anything", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const preview = await moves.previewMove(b.id, "2039-08-01", "2039-08-04", beforeArrival(60));
    expect(preview).toMatchObject({ ok: true, preview: { oldTotalPence: 45000, newTotalPence: 45000, paidPence: 22500, warnings: [] } });
    expect((await reservation(b.id)).checkIn).toBe(arrival);
  });

  it("at 72 hours: moves the stay, frees the old dates, keeps the balance and emails the guest", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const { preview, result } = await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(3));
    expect(preview.ok && preview.preview.warnings).toEqual([]);
    expect(result).toMatchObject({ ok: true });

    const r = await reservation(b.id);
    expect(r).toMatchObject({ checkIn: "2039-08-01", checkOut: "2039-08-04", totalPence: 45000, arrivalWhenMoved: arrival, status: "CONFIRMED" });
    expect(r.movedAt).not.toBeNull();
    expect(await balances(b.id)).toEqual([expect.objectContaining({ status: "PENDING", amountPence: 22500, dueDate: "2039-07-25", customerId: "cus_x" })]);

    const email = await movedEmail(b.id);
    expect(email).toContain("has moved to the new dates below");
    expect(email).toContain("The price is unchanged at £450.00.");
    expect(email).toContain("The remaining £225.00 will be taken from the card you paid with on");
    expect(email).toContain("keeps the cancellation terms that applied on the day it was moved");

    // The old dates can be booked again; the new ones can't.
    const old = await holds.createHold(b.propertyId, { checkIn: b.checkIn, checkOut: b.checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
    expect(old.ok).toBe(true);
    const taken = await holds.createHold(b.propertyId, { checkIn: "2039-08-02", checkOut: "2039-08-04", adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
    expect(taken.ok).toBe(false);
  });

  it("at 24 hours: still allowed, as it's the owner's call, with a warning", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const { preview, result } = await move(b.id, "2039-08-01", "2039-08-03", beforeArrival(1));
    expect(preview.ok && preview.preview.warnings).toEqual([
      "It's less than 48 hours before the original arrival.",
      "The new stay is shorter (2 nights instead of 3).",
    ]);
    expect(result).toMatchObject({ ok: true });
    expect((await reservation(b.id)).totalPence).toBe(30000);
  });

  it("dearer dates: the difference goes on the balance charged to the saved card", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    await priceNights(b.propertyId, "2039-08-01", "2039-08-04", 20000);
    const { preview, result } = await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(40));
    expect(preview.ok && preview.preview.plan).toMatchObject({ owedPence: 37500, creditPence: 0, chargedAutomatically: true });
    expect(result).toMatchObject({ ok: true });
    expect(await balances(b.id)).toEqual([expect.objectContaining({ status: "PENDING", amountPence: 37500, dueDate: "2039-07-25" })]);
    expect(await movedEmail(b.id)).toContain("The price for your new dates is £600.00 (it was £450.00).");

    // Charged with the daily balance run on the due date.
    const outcomes = await balance.chargeDueBalances(g, new Date("2039-07-25T09:00:00Z"), (await balances(b.id))[0].id);
    expect(outcomes).toEqual([expect.objectContaining({ ok: true })]);
    expect(g.charges[0]).toMatchObject({ amountPence: 37500, customerId: "cus_x", paymentMethodId: "pm_x" });
  });

  it("dearer dates after the balance was taken: a new charge for the difference", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const [bal] = await balances(b.id);
    await dbMod.db()`UPDATE payments SET status = 'SUCCEEDED', captured_at = now() WHERE id = ${bal.id}`;
    await priceNights(b.propertyId, "2039-08-01", "2039-08-04", 20000);
    const { result } = await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(3));
    expect(result).toMatchObject({ ok: true });
    const after = await balances(b.id);
    expect(after).toEqual([
      expect.objectContaining({ status: "SUCCEEDED", amountPence: 22500 }),
      expect.objectContaining({ status: "PENDING", amountPence: 15000, dueDate: "2039-07-25", customerId: "cus_x" }),
    ]);
  });

  it("dearer dates with no saved card: flagged for the owner to collect", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const [bal] = await balances(b.id);
    await dbMod.db()`UPDATE payments SET status = 'SUCCEEDED', captured_at = now(), stripe_customer_id = NULL, stripe_payment_method_id = NULL WHERE id = ${bal.id}`;
    await priceNights(b.propertyId, "2039-08-01", "2039-08-04", 20000);
    const { preview } = await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(3));
    expect(preview.ok && preview.preview.plan.chargedAutomatically).toBe(false);
    expect(await movedEmail(b.id)).toContain("£150.00 is still to pay. We'll be in touch to arrange it.");
    const attention = await bookings.needsAttention();
    expect(attention.balancesToCollect).toContainEqual(expect.objectContaining({ reservationId: b.id, amountPence: 15000 }));
  });

  it("cheaper dates: less on the balance, and anything paid beyond the new price held as credit", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    await priceNights(b.propertyId, "2039-08-01", "2039-09-30", 10000);
    await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(40));
    expect(await balances(b.id)).toEqual([expect.objectContaining({ status: "PENDING", amountPence: 7500 })]);

    // Now paid in full, then moved somewhere cheaper again.
    const [bal] = await balances(b.id);
    await dbMod.db()`UPDATE payments SET status = 'SUCCEEDED', captured_at = now() WHERE id = ${bal.id}`;
    await dbMod.db()`DELETE FROM emails WHERE reservation_id = ${b.id}`;
    const { preview, result } = await move(b.id, "2039-09-01", "2039-09-03", beforeArrival(40));
    expect(preview.ok && preview.preview.plan).toMatchObject({ owedPence: 0, creditPence: 10000 });
    expect(result).toMatchObject({ ok: true });
    expect(await movedEmail(b.id)).toContain("We're holding £100.00 as credit for a future stay.");
    expect(await moves.getMoves(b.id)).toHaveLength(2);
  });

  it("moved then cancelled: the refund follows the terms from the day it moved", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    // Moved 45 days before the original arrival, to dates much later on.
    await move(b.id, "2040-01-10", "2040-01-13", beforeArrival(45));
    const cancelAt = new Date(Date.parse("2040-01-10T12:00:00Z") - 10 * DAY);
    expect(await cancellations.previewCancellation(b.id, cancelAt)).toMatchObject({ rule: "FULL", daysBefore: 45, moved: true, refundPence: 22500 });

    // Moved 3 days before: no refund, even far ahead of the new dates.
    const c = await confirmedBooking(g);
    await move(c.id, "2040-01-10", "2040-01-13", beforeArrival(3));
    expect(await cancellations.previewCancellation(c.id, new Date("2039-08-01T12:00:00Z"))).toMatchObject({ rule: "NONE", daysBefore: 3, refundPence: 0 });
  });

  it("a second move keeps the terms from the first", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(45));
    const { preview } = await move(b.id, "2039-08-10", "2039-08-13", beforeArrival(2));
    expect(preview.ok && preview.preview.warnings).toContain("This booking has been moved before. It keeps the cancellation terms from its first move.");
    expect(await reservation(b.id)).toMatchObject({ checkIn: "2039-08-10", arrivalWhenMoved: arrival });
  });

  it("can overlap its own old dates", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const { result } = await move(b.id, plusDays(arrival, 1), plusDays(arrival, 4), beforeArrival(10));
    expect(result).toMatchObject({ ok: true });
  });

  it("refuses dates that are taken, and changes nothing", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    await dbMod.db()`INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by) VALUES (${b.propertyId}, '2039-08-02', '2039-08-03', 'test', 'test')`;
    const { preview } = await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(40));
    expect(preview).toMatchObject({ ok: false, error: expect.stringContaining("a block you added") });
    expect((await reservation(b.id)).checkIn).toBe(arrival);
  });

  it("does nothing if the price changed after the preview", async () => {
    const g = gateway();
    const b = await confirmedBooking(g);
    const { result } = await move(b.id, "2039-08-01", "2039-08-04", beforeArrival(40), { approvedTotalPence: 40000 });
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("nothing has been done") });
    expect((await reservation(b.id)).checkIn).toBe(arrival);
    expect(await moves.getMoves(b.id)).toEqual([]);
  });
});
