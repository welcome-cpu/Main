// System-wide concurrency against a real database (npm run test:integration).
// Many guests, duplicated and late Stripe webhooks, and admin actions all at
// once; then checks the guarantees that must always hold.

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
let bookings: typeof import("@/lib/admin/bookings");

const admin = { id: randomUUID(), email: "owner@example.com", displayName: null, role: "OWNER" as const };

/** Fake Stripe that tracks every authorisation's fate. */
class Ledger implements PaymentGateway {
  intents = new Map<string, PaymentIntentInfo>();
  captured = new Set<string>();
  cancelled = new Set<string>();
  async createCheckout() {
    return { sessionId: `cs_test_${randomUUID()}`, url: "https://checkout.stripe.test" };
  }
  async expireCheckout() {}
  async checkoutUrl() {
    return null;
  }
  async retrievePaymentIntent(id: string) {
    return this.intents.get(id)!;
  }
  async capture(id: string) {
    // Stripe's idempotency key makes repeat captures of one intent a single charge.
    this.captured.add(id);
    const pi = this.intents.get(id)!;
    this.intents.set(id, { ...pi, status: "succeeded", amountReceived: pi.amountCapturable });
    return { status: "succeeded" };
  }
  async cancel(id: string) {
    if (this.captured.has(id)) throw new Error("cannot cancel a captured payment");
    this.cancelled.add(id);
  }
  async chargeOffSession(): Promise<never> {
    throw new Error("unused");
  }
  parseWebhook(): Stripe.Event {
    throw new Error("unused");
  }
}

const guest = (n: number) => ({ firstName: `Guest${n}`, lastName: "Storm", email: `storm${n}@example.com`, phone: "07700 900010", country: null, message: null });
const stay = (checkIn: string, checkOut: string) => ({ checkIn, checkOut, adults: 2, children: 0, infants: 0, pets: 0, extras: [], discountCode: null });
const date = (base: string, n: number) => {
  const d = new Date(`${base}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

async function createProperty(turnover = 0) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, base_nightly_pence, default_min_nights, turnover_nights,
      deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, 'Storm test', true, 4, 10000, 1, ${turnover}, 50, 7, 7000, 0) RETURNING id
  `;
  return { id, slug };
}

/** Hold + checkout for one guest; returns the authorised-payment webhook event, or null if no hold. */
async function attempt(ledger: Ledger, property: { id: string; slug: string }, n: number, checkIn: string, checkOut: string) {
  const hold = await holds.createHold(property.id, stay(checkIn, checkOut), guest(n), { ip: null });
  if (!hold.ok) return null;
  const started = await checkout.startCheckout(ledger, hold, { propertyName: "Storm", guestEmail: guest(n).email, origin: "https://example.test", slug: property.slug });
  if (!started.ok) return null;
  const [payment] = await dbMod.db()<{ id: string; sessionId: string; amountPence: number }[]>`
    SELECT id, stripe_checkout_session_id AS session_id, amount_pence FROM payments WHERE reservation_id = ${hold.reservationId}
  `;
  const piId = `pi_${randomUUID().replaceAll("-", "")}`;
  ledger.intents.set(piId, { id: piId, status: "requires_capture", amount: payment.amountPence, amountCapturable: payment.amountPence, amountReceived: 0, currency: "GBP", customerId: `cus_${n}`, paymentMethodId: `pm_${n}`, metadata: {} });
  const event = () =>
    ({ id: `evt_${randomUUID()}`, type: "checkout.session.completed", livemode: false, data: { object: { id: payment.sessionId, payment_intent: piId, metadata: { payment_id: payment.id } } } }) as unknown as Stripe.Event;
  return { reservationId: hold.reservationId, piId, event };
}

/** The guarantees. Each query must return nothing. */
async function checkInvariants(ledger: Ledger, propertyId: string) {
  const sql = dbMod.db();
  const overlaps = await sql`
    SELECT a.reference, b.reference FROM reservations a JOIN reservations b
      ON a.property_id = b.property_id AND a.id < b.id AND a.blocked && b.blocked
    WHERE a.property_id = ${propertyId}
      AND (a.status = 'CONFIRMED' OR (a.status = 'HOLD' AND a.hold_expires_at > now()))
      AND (b.status = 'CONFIRMED' OR (b.status = 'HOLD' AND b.hold_expires_at > now()))
  `;
  expect(overlaps, "no two live bookings may overlap").toEqual([]);

  const moneyWithoutBooking = await sql`
    SELECT r.reference, r.status FROM payments p JOIN reservations r ON r.id = p.reservation_id
    WHERE r.property_id = ${propertyId} AND p.status = 'SUCCEEDED' AND r.status <> 'CONFIRMED'
      AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.entity_id = r.id::text AND a.action = 'reservation.cancelled')
  `;
  expect(moneyWithoutBooking, "money is only ever taken for a confirmed booking").toEqual([]);

  const confirmations = await sql<{ reference: string; deposits: number; confirmedAudits: number; emails: number }[]>`
    SELECT r.reference,
      (SELECT count(*)::int FROM payments p WHERE p.reservation_id = r.id AND p.kind IN ('DEPOSIT','FULL') AND p.status = 'SUCCEEDED') AS deposits,
      (SELECT count(*)::int FROM audit_log a WHERE a.entity_id = r.id::text AND a.action = 'reservation.confirmed') AS confirmed_audits,
      (SELECT count(*)::int FROM emails e WHERE e.reservation_id = r.id AND e.kind = 'BOOKING_CONFIRMED') AS emails
    FROM reservations r WHERE r.property_id = ${propertyId} AND r.status = 'CONFIRMED'
  `;
  for (const c of confirmations) {
    expect(c, `${c.reference}: one deposit, one confirmation, one email`).toMatchObject({ deposits: 1, confirmedAudits: 1, emails: 1 });
  }

  // Every card authorisation ended up either captured or released, never both, never neither.
  for (const id of ledger.intents.keys()) {
    const fates = Number(ledger.captured.has(id)) + Number(ledger.cancelled.has(id));
    expect(fates, `authorisation ${id} resolved exactly once`).toBe(1);
  }
  return confirmations.length;
}

describe.runIf(enabled)("system-wide concurrency (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.STRIPE_SECRET_KEY = "sk_test_fake";
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    checkout = await import("@/lib/payments/checkout");
    webhook = await import("@/lib/payments/webhook");
    bookings = await import("@/lib/admin/bookings");
  });
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("a storm of overlapping bookings and duplicated webhooks never double-books or mischarges", async () => {
    const ledger = new Ledger();
    const property = await createProperty(1);
    const base = "2039-03-01";

    // 16 guests try overlapping 2–4 night stays inside a 12-night window, all at once.
    const attempts = await Promise.all(
      Array.from({ length: 16 }, (_, n) => {
        const start = (n * 5) % 9;
        return attempt(ledger, property, n, date(base, start), date(base, start + 2 + (n % 3)));
      })
    );
    const winners = attempts.filter((a): a is NonNullable<typeof a> => a !== null);
    expect(winners.length).toBeGreaterThan(0);
    expect(winners.length).toBeLessThan(16);

    // Stripe confirms each payment twice, all concurrently.
    await Promise.all(winners.flatMap((w) => [webhook.handleStripeEvent(w.event(), ledger), webhook.handleStripeEvent(w.event(), ledger)]));

    expect(await checkInvariants(ledger, property.id)).toBe(winners.length);
  }, 180_000);

  it("a late payment and a new guest racing for the same dates: exactly one gets them, the other isn't charged", async () => {
    for (let round = 0; round < 4; round++) {
      const ledger = new Ledger();
      const property = await createProperty();
      const a = await attempt(ledger, property, 1, "2039-06-01", "2039-06-04");
      if (!a) throw new Error("first hold");
      // A's hold lapses before their payment arrives...
      await dbMod.db()`UPDATE reservations SET hold_expires_at = now() - interval '1 second' WHERE id = ${a.reservationId}`;

      // ...and B starts booking the same dates at the same moment A's webhook lands.
      const [, b] = await Promise.all([
        webhook.handleStripeEvent(a.event(), ledger),
        attempt(ledger, property, 2, "2039-06-02", "2039-06-05"),
      ]);
      if (b) await webhook.handleStripeEvent(b.event(), ledger);

      expect(await checkInvariants(ledger, property.id)).toBe(1);
    }
  }, 180_000);

  it("an admin cancelling a booking while its payment lands never leaves money taken silently", async () => {
    for (let round = 0; round < 4; round++) {
      const ledger = new Ledger();
      const property = await createProperty();
      const a = await attempt(ledger, property, 1, "2039-09-01", "2039-09-04");
      if (!a) throw new Error("hold");

      await Promise.all([
        webhook.handleStripeEvent(a.event(), ledger),
        bookings.cancelBooking(admin, a.reservationId, { reason: "Race test", emailGuest: false }),
      ]);

      // Either the cancel won (authorisation released, nothing charged) or the
      // payment won and the admin then cancelled a paid booking (refund via Stripe).
      // checkInvariants allows the latter only when the cancellation is on record.
      await checkInvariants(ledger, property.id);
      const [r] = await dbMod.db()<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${a.reservationId}`;
      expect(["CANCELLED", "CONFIRMED"]).toContain(r.status);
      if (ledger.captured.has(a.piId)) {
        const [audit] = await dbMod.db()<{ n: number }[]>`
          SELECT count(*)::int AS n FROM audit_log WHERE entity_id = ${a.reservationId} AND action = 'reservation.confirmed'
        `;
        expect(audit.n).toBe(1);
      }
    }
  }, 180_000);
});
