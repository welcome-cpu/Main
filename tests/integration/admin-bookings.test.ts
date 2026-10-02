// Admin booking management against a real database (npm run test:integration).

import { randomUUID } from "node:crypto";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PaymentGateway, PaymentIntentInfo } from "@/lib/payments/gateway";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

let dbMod: typeof import("@/lib/db/client");
let holds: typeof import("@/lib/booking/holds");
let checkout: typeof import("@/lib/payments/checkout");
let webhook: typeof import("@/lib/payments/webhook");
let balance: typeof import("@/lib/payments/balance");
let bookings: typeof import("@/lib/admin/bookings");
let calendar: typeof import("@/lib/admin/calendar");

const admin = { id: randomUUID(), email: "owner@example.com", displayName: null, role: "OWNER" as const };
const guest = { firstName: "Admin", lastName: "Testguest", email: "admin-test@example.com", phone: "07700 900003", country: null, message: null };

function gateway(chargeFails = false): PaymentGateway & { intents: Map<string, PaymentIntentInfo>; charges: number } {
  const intents = new Map<string, PaymentIntentInfo>();
  const g = {
    intents,
    charges: 0,
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
    async chargeOffSession(c: { paymentId: string }) {
      g.charges++;
      return chargeFails
        ? { ok: false as const, paymentIntentId: null, code: "card_declined", message: "Declined" }
        : { ok: true as const, paymentIntentId: `pi_bal_${c.paymentId}`, status: "succeeded" };
    },
    parseWebhook(): Stripe.Event {
      throw new Error("unused");
    },
  };
  return g;
}

async function confirmedBooking(checkIn: string, checkOut: string, g = gateway()) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id: propertyId }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, base_nightly_pence, default_min_nights,
      deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, ${"Admin " + slug}, true, 4, 15000, 2, 50, 7, 6000, 0) RETURNING id
  `;
  const hold = await holds.createHold(propertyId, { checkIn, checkOut, adults: 2, children: 1, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
  if (!hold.ok) throw new Error("hold");
  await checkout.startCheckout(g, hold, { propertyName: "Admin test", guestEmail: guest.email, origin: "https://example.test", slug });
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments WHERE reservation_id = ${hold.reservationId}
  `;
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  g.intents.set(piId, { id: piId, status: "requires_capture", amount: payment.amountPence, amountCapturable: payment.amountPence, amountReceived: 0, currency: "GBP", customerId: "cus_admin", paymentMethodId: "pm_admin", metadata: {} });
  await webhook.handleStripeEvent(
    { id: `evt_${randomUUID()}`, type: "checkout.session.completed", livemode: false, data: { object: { id: payment.sessionId, payment_intent: piId, metadata: { payment_id: payment.id } } } } as unknown as Stripe.Event,
    g
  );
  return { id: hold.reservationId, reference: hold.reference, propertyId };
}

describe.runIf(enabled)("admin bookings (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    balance = await import("@/lib/payments/balance");
    bookings = await import("@/lib/admin/bookings");
    calendar = await import("@/lib/admin/calendar");
  });
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("lists a booking with guest, guests, paid amount, balance and statuses", async () => {
    const b = await confirmedBooking("2038-03-01", "2038-03-04");
    const rows = await bookings.listBookings({ propertyId: b.propertyId, source: null, status: "CONFIRMED", from: "2038-01-01", to: null });
    expect(rows).toEqual([
      expect.objectContaining({
        kind: "RESERVATION",
        reference: b.reference,
        guestName: "Admin Testguest",
        guests: "2 ad, 1 ch",
        source: "DIRECT",
        totalPence: 45000,
        paidPence: 22500,
        balancePence: 22500,
        paymentStatus: "PART_PAID",
        status: "CONFIRMED",
      }),
    ]);
  });

  it("filters by source and includes imported bookings without payment details", async () => {
    const b = await confirmedBooking("2038-04-01", "2038-04-04");
    const [{ id: feedId }] = await dbMod.db()<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url) VALUES (${b.propertyId}, 'AIRBNB', 'Airbnb', ${`https://feeds.test/${randomUUID()}.ics`}) RETURNING id
    `;
    await dbMod.db()`
      INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, summary, status, content_hash)
      VALUES (${feedId}, ${b.propertyId}, 'abnb-1', '2038-04-10', '2038-04-12', 'Airbnb guest', 'ACTIVE', 'x')
    `;
    const all = await bookings.listBookings({ propertyId: b.propertyId, source: null, status: "CONFIRMED", from: "2038-01-01", to: null });
    expect(all.map((r) => [r.kind, r.source])).toEqual([["RESERVATION", "DIRECT"], ["EXTERNAL", "AIRBNB"]]);
    expect(all[1]).toMatchObject({ totalPence: null, paidPence: null });

    const airbnbOnly = await bookings.listBookings({ propertyId: b.propertyId, source: "AIRBNB", status: "CONFIRMED", from: "2038-01-01", to: null });
    expect(airbnbOnly.map((r) => r.source)).toEqual(["AIRBNB"]);
    const directOnly = await bookings.listBookings({ propertyId: b.propertyId, source: "DIRECT", status: "CONFIRMED", from: "2038-01-01", to: null });
    expect(directOnly.map((r) => r.source)).toEqual(["DIRECT"]);
  });

  it("shows the full booking with payments, emails and history", async () => {
    const b = await confirmedBooking("2038-05-01", "2038-05-04");
    const detail = await bookings.getBooking(b.id);
    expect(detail).toMatchObject({ reference: b.reference, status: "CONFIRMED", guest: { email: guest.email } });
    expect(detail!.payments.map((p) => [p.kind, p.status])).toEqual([["DEPOSIT", "SUCCEEDED"], ["BALANCE", "PENDING"]]);
    expect(detail!.history.map((h) => h.action)).toEqual(expect.arrayContaining(["reservation.hold_created", "reservation.confirmed", "payment.confirmed"]));
    expect(detail!.emails.map((e) => e.kind)).toContain("BOOKING_CONFIRMED");
  });

  it("cancelling frees the dates, calls off the balance and emails the guest", async () => {
    const b = await confirmedBooking("2038-06-01", "2038-06-04");
    expect(await bookings.cancelBooking(admin, b.id, { reason: "Guest asked", emailGuest: true })).toEqual({});

    const detail = await bookings.getBooking(b.id);
    expect(detail).toMatchObject({ status: "CANCELLED", cancellationReason: "Guest asked" });
    expect(detail!.payments.find((p) => p.kind === "BALANCE")?.status).toBe("CANCELLED");
    expect(detail!.emails.map((e) => e.kind)).toContain("BOOKING_CANCELLED");
    expect(detail!.history.at(-1)).toMatchObject({ action: "reservation.cancelled", actor: admin.email });

    const again = await holds.createHold(b.propertyId, { checkIn: "2038-06-01", checkOut: "2038-06-04", adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });
    expect(again.ok).toBe(true);
    expect((await bookings.cancelBooking(admin, b.id, { reason: "again", emailGuest: false })).error).toBeDefined();
  });

  it("records a manual payment, stopping the automatic charge", async () => {
    const g = gateway();
    const b = await confirmedBooking("2038-07-01", "2038-07-04", g);
    expect((await bookings.recordManualPayment(admin, b.id, { amountPence: 99999999, note: "" })).error).toMatch(/more than/);
    expect(await bookings.recordManualPayment(admin, b.id, { amountPence: 22500, note: "Bank transfer" })).toEqual({});

    const detail = await bookings.getBooking(b.id);
    expect(detail).toMatchObject({ paidPence: 45000, balancePence: 0, paymentStatus: "PAID" });
    await dbMod.db()`UPDATE payments SET due_date = '2000-01-01' WHERE reservation_id = ${b.id} AND kind = 'BALANCE'`;
    await balance.chargeDueBalances(g);
    expect(g.charges).toBe(0);
  });

  it("retries a failed balance with a fresh charge", async () => {
    const failing = gateway(true);
    const b = await confirmedBooking("2038-08-01", "2038-08-04", failing);
    await dbMod.db()`UPDATE payments SET due_date = '2000-01-01' WHERE reservation_id = ${b.id} AND kind = 'BALANCE'`;
    await balance.chargeDueBalances(failing);
    expect((await bookings.needsAttention()).failedPayments.map((f) => f.reference)).toContain(b.reference);

    const scheduled = await bookings.scheduleBalanceRetry(admin, b.id);
    const ok = gateway();
    const [outcome] = await balance.chargeDueBalances(ok, new Date(), scheduled.paymentId!);
    expect(outcome.ok).toBe(true);
    expect((await bookings.getBooking(b.id))?.paymentStatus).toBe("PAID");
    expect((await bookings.needsAttention()).failedPayments.map((f) => f.reference)).not.toContain(b.reference);
    expect((await bookings.scheduleBalanceRetry(admin, b.id)).error).toBeDefined();
  });

  it("puts every kind of booking and block on the calendar", async () => {
    const b = await confirmedBooking("2038-09-01", "2038-09-04");
    const [{ id: feedId }] = await dbMod.db()<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url) VALUES (${b.propertyId}, 'BOOKING_COM', 'Booking.com', ${`https://feeds.test/${randomUUID()}.ics`}) RETURNING id
    `;
    await dbMod.db()`
      INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, status, content_hash)
      VALUES (${feedId}, ${b.propertyId}, 'bcom-1', '2038-09-05', '2038-09-07', 'ACTIVE', 'x')
    `;
    await dbMod.db()`
      INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
      VALUES (${b.propertyId}, '2038-09-10', '2038-09-12', 'Painting', 'owner')
    `;
    await holds.createHold(b.propertyId, { checkIn: "2038-09-14", checkOut: "2038-09-16", adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null }, guest, { ip: null });

    const row = (await calendar.loadAdminCalendar("2038-09-01", "2038-10-01")).find((r) => r.propertyId === b.propertyId)!;
    expect(row.items.map((i) => [i.type, i.start, i.end])).toEqual([
      ["DIRECT", "2038-09-01", "2038-09-04"],
      ["BOOKING_COM", "2038-09-05", "2038-09-07"],
      ["BLOCK", "2038-09-10", "2038-09-12"],
      ["HOLD", "2038-09-14", "2038-09-16"],
    ]);
    expect(row.items[0].reservationId).toBe(b.id);
  });
});
