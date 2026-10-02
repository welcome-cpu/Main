// Temporary booking holds against a real database (npm run test:integration).
// The concurrency tests here are the core double-booking guarantees.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Holds = typeof import("@/lib/booking/holds");
type Blocks = typeof import("@/lib/admin/blocks");
type HoldRoute = typeof import("@/app/api/book/[slug]/hold/route");
type ReservationRoute = typeof import("@/app/api/reservations/[id]/route");

let dbMod: Db;
let holds: Holds;
let blocks: Blocks;
let holdRoute: HoldRoute;
let reservationRoute: ReservationRoute;

const guest = { firstName: "Test", lastName: "Guest", email: "guest@example.com", phone: "07700 900000", country: null, message: null };
const admin = { id: randomUUID(), email: "test@example.com", displayName: null, role: "OWNER" as const };
const stay = (checkIn: string, checkOut: string, extra: object = {}) => ({
  checkIn,
  checkOut,
  adults: 2,
  children: 0,
  infants: 0,
  pets: 0,
  extras: [],
  discountCode: null,
  ...extra,
});

async function createProperty() {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence, pet_fee_pence,
      default_min_nights, deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
    VALUES (${slug}, 'Hold test', true, 4, 2, 15000, 4000, 2, 50, 7, 3650, 0)
    RETURNING id
  `;
  return { id, slug };
}

const statusOf = async (id: string) =>
  (await dbMod.db()<{ status: string }[]>`SELECT status FROM reservations WHERE id = ${id}`)[0]?.status;

describe.runIf(enabled)("booking holds (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.DIRECT_BOOKING_ENABLED = "true";
    delete process.env.TURNSTILE_SECRET_KEY;
    dbMod = await import("@/lib/db/client");
    holds = await import("@/lib/booking/holds");
    blocks = await import("@/lib/admin/blocks");
    holdRoute = await import("@/app/api/book/[slug]/hold/route");
    reservationRoute = await import("@/app/api/reservations/[id]/route");
  });
  afterAll(async () => {
    delete process.env.DIRECT_BOOKING_ENABLED;
    await dbMod?.db().end();
  });

  it("creates a hold with the server's price snapshot", async () => {
    const p = await createProperty();
    const result = await holds.createHold(p.id, stay("2033-03-01", "2033-03-04", { pets: 1 }), guest, { ip: null });
    if (!result.ok) throw new Error("expected a hold");
    expect(result.reference).toMatch(/^GC-[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(result.quote.totalPence).toBe(3 * 15000 + 4000);

    const [row] = await dbMod.db()<{ status: string; totalPence: number; depositPence: number; source: string; minutesLeft: number }[]>`
      SELECT status, total_pence, deposit_pence, source,
             round(extract(epoch FROM hold_expires_at - now()) / 60)::int AS minutes_left
      FROM reservations WHERE id = ${result.reservationId}
    `;
    expect(row).toEqual({ status: "HOLD", totalPence: 49000, depositPence: 24500, source: "DIRECT", minutesLeft: 35 });
  });

  it("blocks the dates while active, for quotes and for other holds", async () => {
    const p = await createProperty();
    expect((await holds.createHold(p.id, stay("2033-04-01", "2033-04-04"), guest, { ip: null })).ok).toBe(true);
    const second = await holds.createHold(p.id, stay("2033-04-03", "2033-04-06"), guest, { ip: null });
    expect(second).toMatchObject({ ok: false, reasons: [{ code: "DATES_TAKEN" }] });
  });

  it("frees the dates once the hold expires, and marks it EXPIRED", async () => {
    const p = await createProperty();
    const first = await holds.createHold(p.id, stay("2033-05-01", "2033-05-04"), guest, { ip: null });
    if (!first.ok) throw new Error("expected a hold");
    await dbMod.db()`UPDATE reservations SET hold_expires_at = now() - interval '1 second' WHERE id = ${first.reservationId}`;

    const second = await holds.createHold(p.id, stay("2033-05-01", "2033-05-04"), guest, { ip: null });
    expect(second.ok).toBe(true);
    expect(await statusOf(first.reservationId)).toBe("EXPIRED");
  });

  it("gives exactly one of two simultaneous attempts the dates", async () => {
    const p = await createProperty();
    const results = await Promise.all([
      holds.createHold(p.id, stay("2033-06-01", "2033-06-05"), guest, { ip: null }),
      holds.createHold(p.id, stay("2033-06-03", "2033-06-07"), guest, { ip: null }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it("gives exactly one of ten simultaneous attempts the same dates", async () => {
    const p = await createProperty();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => holds.createHold(p.id, stay("2033-07-01", "2033-07-04"), guest, { ip: null }))
    );
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const [{ live }] = await dbMod.db()<{ live: number }[]>`
      SELECT count(*)::int AS live FROM reservations WHERE property_id = ${p.id} AND status = 'HOLD'
    `;
    expect(live).toBe(1);
  }, 60_000);

  it("lets simultaneous attempts at different properties both succeed", async () => {
    const [a, b] = [await createProperty(), await createProperty()];
    const results = await Promise.all([
      holds.createHold(a.id, stay("2033-08-01", "2033-08-04"), guest, { ip: null }),
      holds.createHold(b.id, stay("2033-08-01", "2033-08-04"), guest, { ip: null }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
  });

  it("never lets a hold and a manual block both take the same night", async () => {
    const p = await createProperty();
    const [hold, block] = await Promise.all([
      holds.createHold(p.id, stay("2033-09-01", "2033-09-04"), guest, { ip: null }),
      blocks.createBlock(admin, p.id, { firstNight: "2033-09-02", lastNight: "2033-09-02", reason: "" }),
    ]);
    expect(Number(hold.ok) + Number(!block.error)).toBe(1);
  });

  it("only shows a hold to the browser holding its access token", async () => {
    const p = await createProperty();
    const result = await holds.createHold(p.id, stay("2033-10-01", "2033-10-03"), guest, { ip: null });
    if (!result.ok) throw new Error("expected a hold");

    expect(await holds.getHoldForGuest(result.reservationId, result.accessToken)).toMatchObject({
      reference: result.reference,
      status: "HOLD",
    });
    expect(await holds.getHoldForGuest(result.reservationId, "x".repeat(43))).toBeNull();

    // The token itself is never stored, only its hash.
    const [row] = await dbMod.db()<{ hash: Buffer }[]>`SELECT access_token_sha256 AS hash FROM reservations WHERE id = ${result.reservationId}`;
    expect(row.hash.toString("base64url")).not.toBe(result.accessToken);
  });

  it("lets the guest release their hold, freeing the dates", async () => {
    const p = await createProperty();
    const result = await holds.createHold(p.id, stay("2033-11-01", "2033-11-03"), guest, { ip: null });
    if (!result.ok) throw new Error("expected a hold");

    expect(await holds.releaseHold(result.reservationId, "x".repeat(43))).toBe(false);
    expect(await holds.releaseHold(result.reservationId, result.accessToken)).toBe(true);
    expect(await statusOf(result.reservationId)).toBe("EXPIRED");
    expect((await holds.createHold(p.id, stay("2033-11-01", "2033-11-03"), guest, { ip: null })).ok).toBe(true);
  });

  describe("public hold endpoint", () => {
    const post = (slug: string, body: unknown, ip = randomUUID()) =>
      holdRoute.POST(
        new Request("https://example.test/api/book/x/hold", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": ip },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ slug }) }
      );

    it("creates a hold, ignoring any price the browser tries to send", async () => {
      const p = await createProperty();
      const res = await post(p.slug, {
        stay: { ...stay("2034-01-10", "2034-01-12"), totalPence: 1, accommodationPence: 1 },
        guest,
        acceptTerms: true,
        totalPence: 1,
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.quote.totalPence).toBe(30000);
      expect(body.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const view = await reservationRoute.GET(
        new Request(`https://example.test/api/reservations/${body.reservationId}`, {
          headers: { "x-access-token": body.accessToken, "x-real-ip": randomUUID() },
        }),
        { params: Promise.resolve({ id: body.reservationId }) }
      );
      expect((await view.json()).status).toBe("HOLD");

      const noToken = await reservationRoute.GET(
        new Request(`https://example.test/api/reservations/${body.reservationId}`, { headers: { "x-real-ip": randomUUID() } }),
        { params: Promise.resolve({ id: body.reservationId }) }
      );
      expect(noToken.status).toBe(404);
    });

    it("requires the booking terms to be accepted and valid guest details", async () => {
      const p = await createProperty();
      expect((await post(p.slug, { stay: stay("2034-02-10", "2034-02-12"), guest, acceptTerms: false })).status).toBe(400);
      expect(
        (await post(p.slug, { stay: stay("2034-02-10", "2034-02-12"), guest: { ...guest, email: "nope" }, acceptTerms: true })).status
      ).toBe(400);
    });

    it("reports taken dates with a 409 and no booking details", async () => {
      const p = await createProperty();
      await post(p.slug, { stay: stay("2034-03-10", "2034-03-12"), guest, acceptTerms: true });
      const res = await post(p.slug, { stay: stay("2034-03-10", "2034-03-12"), guest, acceptTerms: true });
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).not.toMatch(/GC-|guest@example/);
    });

    it("limits holds to 5 per address per 10 minutes", async () => {
      const p = await createProperty();
      const ip = randomUUID();
      // If the run straddles a 10-minute boundary the count resets once, so
      // the first refusal comes between the 6th and 11th request.
      let firstRefusal = -1;
      for (let i = 0; i < 11 && firstRefusal < 0; i++) {
        const checkIn = `2034-${String(4 + Math.floor(i / 5)).padStart(2, "0")}-${String(1 + (i % 5) * 5).padStart(2, "0")}`;
        const checkOut = `2034-${String(4 + Math.floor(i / 5)).padStart(2, "0")}-${String(3 + (i % 5) * 5).padStart(2, "0")}`;
        const status = (await post(p.slug, { stay: stay(checkIn, checkOut), guest, acceptTerms: true }, ip)).status;
        if (status === 429) firstRefusal = i;
        else expect(status).toBe(201);
      }
      expect(firstRefusal).toBeGreaterThanOrEqual(5);
    }, 60_000);

    it("requires a Turnstile token when Turnstile is configured", async () => {
      const p = await createProperty();
      process.env.TURNSTILE_SECRET_KEY = "test-secret";
      try {
        const res = await post(p.slug, { stay: stay("2034-05-10", "2034-05-12"), guest, acceptTerms: true });
        expect(res.status).toBe(400);
      } finally {
        delete process.env.TURNSTILE_SECRET_KEY;
      }
    });
  });
});
