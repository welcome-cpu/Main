// Availability engine against a real Postgres database (npm run test:integration).
// Only ever runs against TEST_DATABASE_URL.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StayRequest } from "@/lib/booking/availability-rules";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Availability = typeof import("@/lib/booking/availability");
type Blocks = typeof import("@/lib/admin/blocks");

let dbMod: Db;
let availability: Availability;
let blocks: Blocks;
const admin = { id: randomUUID(), email: "test@example.com", displayName: null, role: "OWNER" as const };

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const reference = () => `GC-${Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join("")}`;
const stay = (checkIn: string, checkOut: string, extra: Partial<StayRequest> = {}): StayRequest => ({
  checkIn,
  checkOut,
  adults: 2,
  children: 0,
  infants: 0,
  pets: 0,
  ...extra,
});

async function createProperty(turnoverNights = 0) {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO properties (slug, name, is_active, max_guests, max_pets, turnover_nights,
      base_nightly_pence, default_min_nights, default_max_nights, advance_notice_hours, booking_window_days)
    VALUES (${slug}, ${"Integration " + slug}, true, 2, 2, ${turnoverNights}, 10000, 2, 28, 24, 3650)
    RETURNING id
  `;
  return id;
}

async function addReservation(
  propertyId: string,
  checkIn: string,
  checkOut: string,
  status: "CONFIRMED" | "HOLD" | "CANCELLED",
  opts: { holdExpiresIn?: string; turnover?: number } = {}
) {
  await dbMod.db()`
    INSERT INTO reservations (reference, property_id, source, status, check_in, check_out, turnover_nights,
      adults, currency, accommodation_pence, total_pence, deposit_pence, price_breakdown, created_by,
      confirmed_at, hold_expires_at, cancelled_at)
    VALUES (${reference()}, ${propertyId}, 'MANUAL', ${status}, ${checkIn}, ${checkOut}, ${opts.turnover ?? 0},
      2, 'GBP', 10000, 10000, 0, '{}', 'test',
      ${status === "CONFIRMED" ? new Date() : null},
      ${status === "HOLD" ? dbMod.db()`now() + ${opts.holdExpiresIn ?? "30 minutes"}::interval` : null},
      ${status === "CANCELLED" ? new Date() : null})
  `;
}

async function addFeed(propertyId: string, source: string, opts: { active?: boolean; applyTurnover?: boolean } = {}) {
  const [{ id }] = await dbMod.db()<{ id: string }[]>`
    INSERT INTO calendar_feeds (property_id, source, name, url, is_active, apply_turnover)
    VALUES (${propertyId}, ${source}, ${source + " feed"}, ${`https://feeds.test/${randomUUID()}.ics`},
      ${opts.active ?? true}, ${opts.applyTurnover ?? true})
    RETURNING id
  `;
  return id;
}

async function addExternal(feedId: string, propertyId: string, start: string, end: string, status = "ACTIVE") {
  await dbMod.db()`
    INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, status, content_hash, removed_at)
    VALUES (${feedId}, ${propertyId}, ${randomUUID()}, ${start}, ${end}, ${status}, 'x',
      ${status === "REMOVED" ? new Date() : null})
  `;
}

const check = (propertyId: string, request: StayRequest) =>
  availability.checkAvailability(dbMod.db(), propertyId, request).then((r) => r!);

describe.runIf(enabled)("availability engine (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    dbMod = await import("@/lib/db/client");
    availability = await import("@/lib/booking/availability");
    blocks = await import("@/lib/admin/blocks");
  });
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("allows a normal stay at an empty property", async () => {
    const p = await createProperty();
    expect(await check(p, stay("2031-03-01", "2031-03-04"))).toMatchObject({ available: true, nights: 3 });
  });

  it("blocks dates held by a confirmed reservation, but allows back-to-back stays", async () => {
    const p = await createProperty();
    await addReservation(p, "2031-03-05", "2031-03-10", "CONFIRMED");
    expect((await check(p, stay("2031-03-08", "2031-03-12"))).available).toBe(false);
    expect((await check(p, stay("2031-03-10", "2031-03-12"))).available).toBe(true);
    expect((await check(p, stay("2031-03-03", "2031-03-05"))).available).toBe(true);
  });

  it("is blocked by an active hold but not an expired or cancelled one", async () => {
    const p = await createProperty();
    await addReservation(p, "2031-04-01", "2031-04-04", "HOLD", { holdExpiresIn: "30 minutes" });
    await addReservation(p, "2031-04-10", "2031-04-14", "HOLD", { holdExpiresIn: "-1 minute" });
    await addReservation(p, "2031-04-20", "2031-04-24", "CANCELLED");

    const active = await check(p, stay("2031-04-02", "2031-04-05"));
    expect(active.conflicts.map((c) => c.kind)).toEqual(["HOLD"]);
    expect((await check(p, stay("2031-04-10", "2031-04-14"))).available).toBe(true);
    expect((await check(p, stay("2031-04-20", "2031-04-24"))).available).toBe(true);
  });

  it("is blocked by imported Airbnb and Booking.com bookings", async () => {
    const p = await createProperty();
    await addExternal(await addFeed(p, "AIRBNB"), p, "2031-05-01", "2031-05-04");
    await addExternal(await addFeed(p, "BOOKING_COM"), p, "2031-05-10", "2031-05-12");

    expect((await check(p, stay("2031-05-02", "2031-05-06"))).conflicts[0]).toMatchObject({ kind: "EXTERNAL", source: "AIRBNB" });
    expect((await check(p, stay("2031-05-09", "2031-05-11"))).conflicts[0]).toMatchObject({ kind: "EXTERNAL", source: "BOOKING_COM" });
  });

  it("ignores removed imported events and calendars that are switched off", async () => {
    const p = await createProperty();
    await addExternal(await addFeed(p, "AIRBNB"), p, "2031-06-01", "2031-06-04", "REMOVED");
    await addExternal(await addFeed(p, "BOOKING_COM", { active: false }), p, "2031-06-10", "2031-06-12");

    expect((await check(p, stay("2031-06-01", "2031-06-04"))).available).toBe(true);
    expect((await check(p, stay("2031-06-10", "2031-06-12"))).available).toBe(true);
  });

  it("applies turnover nights after reservations and imported bookings", async () => {
    const p = await createProperty(1);
    await addReservation(p, "2031-07-01", "2031-07-05", "CONFIRMED", { turnover: 1 });
    await addExternal(await addFeed(p, "LODGIFY"), p, "2031-07-10", "2031-07-14");
    await addExternal(await addFeed(p, "OTHER", { applyTurnover: false }), p, "2031-07-20", "2031-07-24");

    expect((await check(p, stay("2031-07-05", "2031-07-08"))).available).toBe(false);
    expect((await check(p, stay("2031-07-06", "2031-07-08"))).available).toBe(true);
    expect((await check(p, stay("2031-07-14", "2031-07-17"))).available).toBe(false);
    expect((await check(p, stay("2031-07-15", "2031-07-17"))).available).toBe(true);
    // Calendar that already includes cleaning days: no extra turnover added.
    expect((await check(p, stay("2031-07-24", "2031-07-27"))).available).toBe(true);
  });

  it("is blocked by a manual block, and freed again when it's removed", async () => {
    const p = await createProperty();
    expect(await blocks.createBlock(admin, p, { firstNight: "2031-08-03", lastNight: "2031-08-04", reason: "Maintenance" })).toEqual({});

    expect((await check(p, stay("2031-08-01", "2031-08-04"))).conflicts.map((c) => c.kind)).toEqual(["MANUAL_BLOCK"]);
    expect((await check(p, stay("2031-08-05", "2031-08-07"))).available).toBe(true); // last night was the 4th

    const [block] = await blocks.listUpcomingBlocks(p);
    await blocks.removeBlock(admin, p, block.id);
    expect((await check(p, stay("2031-08-01", "2031-08-04"))).available).toBe(true);
  });

  it("refuses to block nights already booked on this website", async () => {
    const p = await createProperty();
    await addReservation(p, "2031-09-05", "2031-09-10", "CONFIRMED");
    const result = await blocks.createBlock(admin, p, { firstNight: "2031-09-08", lastNight: "2031-09-12", reason: "" });
    expect(result.error).toMatch(/overlap booking GC-/);
    // Blocking from the checkout day is fine: that night isn't part of the stay.
    expect(await blocks.createBlock(admin, p, { firstNight: "2031-09-10", lastNight: "2031-09-12", reason: "" })).toEqual({});
  });

  it("takes the minimum stay from a rate rule, then the night's rate, then the default", async () => {
    const p = await createProperty();
    const sql = dbMod.db();
    await sql`UPDATE properties SET rate_source = 'LODGIFY', lodgify_property_id = ${Math.floor(Math.random() * 1e9)}, lodgify_room_type_id = 1 WHERE id = ${p}`;
    await sql`INSERT INTO nightly_rates (property_id, night, price_pence, min_nights, source) VALUES (${p}, '2031-10-01', 10000, 4, 'LODGIFY_IMPORT')`;
    await sql`INSERT INTO rate_rules (property_id, name, nights, min_nights, priority) VALUES (${p}, 'Christmas', daterange('2031-12-20', '2032-01-03'), 7, 0)`;

    expect((await check(p, stay("2031-10-01", "2031-10-04"))).reasons.map((r) => r.code)).toEqual(["MIN_STAY"]);
    expect((await check(p, stay("2031-10-01", "2031-10-05"))).available).toBe(true);
    expect((await check(p, stay("2031-12-22", "2031-12-26"))).reasons.map((r) => r.code)).toEqual(["MIN_STAY"]);
    expect((await check(p, stay("2031-11-01", "2031-11-03"))).available).toBe(true); // default 2
  });
});
