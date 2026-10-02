// Public availability API against a real database (npm run test:integration).
// Calls the actual route handlers, so this also covers the feature switch,
// validation, rate limiting and — most importantly — privacy of the output.

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type CalendarRoute = typeof import("@/app/api/availability/[slug]/route");
type CheckRoute = typeof import("@/app/api/availability/[slug]/check/route");

let dbMod: Db;
let calendarRoute: CalendarRoute;
let checkRoute: CheckRoute;
let slug: string;
const GUEST_NAME = "Secret Guestname";
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const reference = () => `GC-${Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join("")}`;

// A unique IP per test keeps rate limits independent between tests.
const get = (url: string, ip = randomUUID()) =>
  new Request(`https://example.test${url}`, { headers: { "x-real-ip": ip } });
const ctx = () => ({ params: Promise.resolve({ slug }) });

describe.runIf(enabled)("public availability API (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.DIRECT_BOOKING_ENABLED = "true";
    dbMod = await import("@/lib/db/client");
    calendarRoute = await import("@/app/api/availability/[slug]/route");
    checkRoute = await import("@/app/api/availability/[slug]/check/route");

    const sql = dbMod.db();
    slug = `test-${randomUUID().slice(0, 8)}`;
    const [{ id }] = await sql<{ id: string }[]>`
      INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence,
        default_min_nights, advance_notice_hours, booking_window_days)
      VALUES (${slug}, 'Public test', true, 2, 1, 10000, 2, 24, 3650) RETURNING id
    `;
    const [{ id: guestId }] = await sql<{ id: string }[]>`
      INSERT INTO guests (first_name, last_name, email) VALUES ('Secret', 'Guestname', 'secret@example.com') RETURNING id
    `;
    await sql`
      INSERT INTO reservations (reference, property_id, source, status, check_in, check_out, adults,
        guest_id, currency, accommodation_pence, total_pence, deposit_pence, price_breakdown, created_by, confirmed_at, terms_accepted_at)
      VALUES (${reference()}, ${id}, 'DIRECT', 'CONFIRMED', '2032-03-05', '2032-03-08', 2,
        ${guestId}, 'GBP', 30000, 30000, 0, '{}', 'test', now(), now())
    `;
    const [{ id: feedId }] = await sql<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url)
      VALUES (${id}, 'AIRBNB', 'Airbnb', ${`https://feeds.test/${slug}.ics`}) RETURNING id
    `;
    await sql`
      INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, summary, status, content_hash)
      VALUES (${feedId}, ${id}, 'airbnb-uid-1', '2032-03-08', '2032-03-10', ${GUEST_NAME}, 'ACTIVE', 'x')
    `;
  });

  afterAll(async () => {
    delete process.env.DIRECT_BOOKING_ENABLED;
    await dbMod?.db().end();
  });

  it("returns merged booked ranges and nothing private", async () => {
    const res = await calendarRoute.GET(get(`/api/availability/${slug}?from=2032-03-01&to=2032-04-01`), ctx());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");

    const body = await res.json();
    // The direct booking (5–8) and the Airbnb one (8–10) merge into one stretch.
    expect(body.unavailable).toEqual([{ start: "2032-03-05", end: "2032-03-10" }]);

    const text = JSON.stringify(body);
    for (const secret of [GUEST_NAME, "Secret", "secret@example.com", "GC-", "AIRBNB", "airbnb-uid-1", "feeds.test", "DIRECT"]) {
      expect(text).not.toContain(secret);
    }
    expect(body.property).not.toHaveProperty("id");
  });

  it("checks specific dates without revealing why they're taken", async () => {
    const res = await checkRoute.GET(get(`/api/availability/${slug}/check?checkIn=2032-03-09&checkOut=2032-03-12&adults=2`), ctx());
    const body = await res.json();
    expect(body).toEqual({
      available: false,
      nights: 3,
      reasons: [{ code: "DATES_TAKEN", message: "Those dates aren't available." }],
    });
  });

  it("confirms free dates", async () => {
    const res = await checkRoute.GET(get(`/api/availability/${slug}/check?checkIn=2032-03-10&checkOut=2032-03-12&adults=2`), ctx());
    expect(await res.json()).toMatchObject({ available: true, nights: 2 });
  });

  it("enforces guest and pet limits from the server", async () => {
    const res = await checkRoute.GET(
      get(`/api/availability/${slug}/check?checkIn=2032-04-10&checkOut=2032-04-12&adults=2&children=1&pets=2`),
      ctx()
    );
    const codes = (await res.json()).reasons.map((r: { code: string }) => r.code);
    expect(codes).toEqual(["TOO_MANY_GUESTS", "TOO_MANY_PETS"]);
  });

  it("rejects invalid input", async () => {
    const res = await checkRoute.GET(get(`/api/availability/${slug}/check?checkIn=2032-02-30&checkOut=2032-03-02`), ctx());
    expect(res.status).toBe(400);
    const range = await calendarRoute.GET(get(`/api/availability/${slug}?from=2032-01-01&to=2034-01-01`), ctx());
    expect(range.status).toBe(400);
  });

  it("returns 404 for an unknown property", async () => {
    const res = await calendarRoute.GET(get(`/api/availability/nope?from=2032-03-01&to=2032-04-01`), {
      params: Promise.resolve({ slug: "no-such-property" }),
    });
    expect(res.status).toBe(404);
  });

  it("rate-limits repeated checks from one address", async () => {
    const ip = randomUUID();
    const url = `/api/availability/${slug}/check?checkIn=2032-05-10&checkOut=2032-05-12`;
    // The limit is 30 a minute. If the run straddles a minute boundary the
    // count resets once, so the first refusal comes between request 31 and 61.
    let firstRefusal = -1;
    for (let i = 0; i < 61 && firstRefusal < 0; i++) {
      const status = (await checkRoute.GET(get(url, ip), ctx())).status;
      if (status === 429) firstRefusal = i;
      else expect(status).toBe(200);
    }
    expect(firstRefusal).toBeGreaterThanOrEqual(30);
  }, 120_000);

  it("doesn't exist when direct booking is switched off", async () => {
    process.env.DIRECT_BOOKING_ENABLED = "false";
    try {
      const res = await calendarRoute.GET(get(`/api/availability/${slug}?from=2032-03-01&to=2032-04-01`), ctx());
      expect(res.status).toBe(404);
    } finally {
      process.env.DIRECT_BOOKING_ENABLED = "true";
    }
  });
});
