// Pricing against a real database (npm run test:integration): the Lodgify
// price import, server-side quotes and the public quote endpoint.

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Import = typeof import("@/lib/pricing/lodgify-import");
type QuoteService = typeof import("@/lib/pricing/quote-service");
type QuoteRoute = typeof import("@/app/api/quote/[slug]/route");

let dbMod: Db;
let importer: Import;
let quotes: QuoteService;
let route: QuoteRoute;
let propertyId: string;
let slug: string;
let todayLocal: string;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function lodgifyResponse(prices: Record<string, number>) {
  return () =>
    new Response(
      JSON.stringify({
        calendar_items: [
          { date: null, is_default: true, prices: [{ price_per_day: 1, min_stay: 1, max_stay: 1 }] },
          ...Object.entries(prices).map(([date, price]) => ({
            date,
            is_default: false,
            prices: [{ price_per_day: price, min_stay: 2, max_stay: 28 }],
          })),
        ],
      }),
      { status: 200 }
    );
}

describe.runIf(enabled)("pricing (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.DIRECT_BOOKING_ENABLED = "true";
    process.env.LODGIFY_API_KEY = "test-key";
    dbMod = await import("@/lib/db/client");
    importer = await import("@/lib/pricing/lodgify-import");
    quotes = await import("@/lib/pricing/quote-service");
    route = await import("@/app/api/quote/[slug]/route");

    slug = `test-${randomUUID().slice(0, 8)}`;
    [{ id: propertyId }] = await dbMod.db()<{ id: string }[]>`
      INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence, pet_fee_pence,
        default_min_nights, deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours,
        rate_source, lodgify_property_id, lodgify_room_type_id)
      VALUES (${slug}, 'Pricing test', true, 4, 2, 15000, 4000, 2, 50, 7, 30, 0,
        'LODGIFY', ${Math.floor(Math.random() * 1e9)}, 1)
      RETURNING id
    `;
    [{ today: todayLocal }] = await dbMod.db()<{ today: string }[]>`SELECT (now() AT TIME ZONE 'Europe/London')::date::text AS today`;
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    delete process.env.DIRECT_BOOKING_ENABLED;
    await dbMod?.db().end();
  });

  it("imports nightly prices from Lodgify without overwriting admin-entered ones", async () => {
    const d = (n: number) => addDays(todayLocal, n);
    await dbMod.db()`
      INSERT INTO nightly_rates (property_id, night, price_pence, source) VALUES (${propertyId}, ${d(12)}, 99900, 'ADMIN')
    `;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () =>
      lodgifyResponse({ [d(10)]: 165, [d(11)]: 175.5, [d(12)]: 185 })()
    ));

    const outcome = await importer.importLodgifyRates(propertyId, "MANUAL", "test@example.com");
    expect(outcome).toMatchObject({ ok: true, nightsWritten: 3 });

    const rows = await dbMod.db()<{ night: string; pricePence: number; source: string }[]>`
      SELECT night, price_pence, source FROM nightly_rates WHERE property_id = ${propertyId} ORDER BY night
    `;
    expect(rows).toEqual([
      { night: d(10), pricePence: 16500, source: "LODGIFY_IMPORT" },
      { night: d(11), pricePence: 17550, source: "LODGIFY_IMPORT" },
      { night: d(12), pricePence: 99900, source: "ADMIN" },
    ]);

    // Re-import with a changed price updates in place.
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => lodgifyResponse({ [d(10)]: 170 })()));
    await importer.importLodgifyRates(propertyId, "SCHEDULED");
    const [updated] = await dbMod.db()<{ pricePence: number }[]>`
      SELECT price_pence FROM nightly_rates WHERE property_id = ${propertyId} AND night = ${d(10)}
    `;
    expect(updated.pricePence).toBe(17000);
  });

  it("leaves prices alone and records the error when Lodgify fails", async () => {
    const before = await dbMod.db()`SELECT night, price_pence FROM nightly_rates WHERE property_id = ${propertyId} ORDER BY night`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("down", { status: 503 })));

    const outcome = await importer.importLodgifyRates(propertyId, "SCHEDULED");
    expect(outcome).toMatchObject({ ok: false, error: "Lodgify returned HTTP 503." });
    expect(await dbMod.db()`SELECT night, price_pence FROM nightly_rates WHERE property_id = ${propertyId} ORDER BY night`).toEqual(before);
    expect(await importer.lastRateImport(propertyId)).toMatchObject({ status: "ERROR" });
  });

  it("quotes a stay from stored rates, with the pet fee and a discount code", async () => {
    const d = (n: number) => addDays(todayLocal, n);
    await dbMod.db()`
      INSERT INTO discount_codes (code, discount_type, percent_off) VALUES (${"T" + slug.slice(5).toUpperCase()}, 'PERCENT', 10)
    `;
    const result = await quotes.quoteStay(dbMod.db(), propertyId, {
      checkIn: d(10),
      checkOut: d(12),
      adults: 2,
      children: 0,
      infants: 0,
      pets: 1,
      extras: [],
      discountCode: "t" + slug.slice(5),
    });
    expect(result?.availability.available).toBe(true);
    if (!result?.pricing?.ok) throw new Error("expected a quote");
    const q = result.pricing.quote;
    expect(q.nights.map((n) => n.pricePence)).toEqual([17000, 17550]);
    expect(q.petFeePence).toBe(4000);
    expect(q.discount?.pence).toBe(3455); // 10% of £345.50, rounded
    expect(q.totalPence).toBe(34550 + 4000 - 3455);
    // Arriving in 10 days with the balance due 7 days before: deposit now.
    expect(q.balanceDueDate).toBe(d(3));
    expect(q.dueNowPence).toBe(Math.round(q.totalPence / 2));
  });

  it("refuses to price nights Lodgify hasn't supplied", async () => {
    const d = (n: number) => addDays(todayLocal, n);
    const result = await quotes.quoteStay(dbMod.db(), propertyId, {
      checkIn: d(20),
      checkOut: d(22),
      adults: 2,
      children: 0,
      infants: 0,
      pets: 0,
      extras: [],
    });
    expect(result?.pricing).toMatchObject({ ok: false, error: { code: "PRICE_UNAVAILABLE" } });
  });

  it("serves quotes publicly without revealing booking details", async () => {
    const d = (n: number) => addDays(todayLocal, n);
    const post = (body: unknown) =>
      route.POST(
        new Request("https://example.test/api/quote/x", {
          method: "POST",
          headers: { "content-type": "application/json", "x-real-ip": randomUUID() },
          body: JSON.stringify(body),
        }),
        { params: Promise.resolve({ slug }) }
      );

    const okRes = await post({ checkIn: d(10), checkOut: d(12), adults: 2 });
    expect(okRes.status).toBe(200);
    const okBody = await okRes.json();
    expect(okBody).toMatchObject({ available: true, quote: { totalPence: 34550 } });

    const bad = await post({ checkIn: d(10), checkOut: d(12), adults: 2, extras: [{ id: "not-a-uuid", quantity: 1 }] });
    expect(bad.status).toBe(400);

    const badCode = await (await post({ checkIn: d(10), checkOut: d(12), adults: 2, discountCode: "NOPE123" })).json();
    expect(badCode).toMatchObject({ available: true, quote: null, quoteError: { code: "DISCOUNT_INVALID" } });

    // Taken dates: a reason, but nothing about the booking.
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const reference = `GC-${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * 32)]).join("")}`;
    await dbMod.db()`
      INSERT INTO reservations (reference, property_id, source, status, check_in, check_out, adults, currency,
        accommodation_pence, total_pence, deposit_pence, price_breakdown, created_by, confirmed_at)
      VALUES (${reference}, ${propertyId}, 'MANUAL', 'CONFIRMED', ${d(15)}, ${d(17)}, 2, 'GBP', 1, 1, 0, '{}', 'test', now())
    `;
    const taken = await (await post({ checkIn: d(15), checkOut: d(17), adults: 2 })).json();
    expect(taken).toMatchObject({ available: false, quote: null });
    expect(JSON.stringify(taken)).not.toContain(reference);
  });
});
