// The Lodgify booking import and guest countries against a real database
// (npm run test:integration). Lodgify itself is stubbed.

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

let dbMod: typeof import("@/lib/db/client");
let importer: typeof import("@/lib/guests/lodgify-import");
let bookings: typeof import("@/lib/admin/bookings");

const lodgifyPropertyId = 900_000_000 + Math.floor(Math.random() * 1e8);
let propertyId: string;
let propertyName: string;

const lodgifyBooking = (id: number, arrival: string, departure: string, extra: Record<string, unknown> = {}) => ({
  id,
  property_id: lodgifyPropertyId,
  arrival,
  departure,
  status: "Booked",
  source: "BookingCom",
  is_deleted: false,
  guest: { name: `Guest ${id}`, phone: "+49 30 901820", email: "hidden@example.com" },
  rooms: [{ guest_breakdown: { adults: 2, children: 0, infants: 0, pets: 1 } }],
  ...extra,
});

function stubLodgify(items: unknown[]) {
  const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ count: items.length, items }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe.runIf(enabled)("Lodgify booking import (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    process.env.LODGIFY_API_KEY = "test-key";
    dbMod = await import("@/lib/db/client");
    importer = await import("@/lib/guests/lodgify-import");
    bookings = await import("@/lib/admin/bookings");

    const sql = dbMod.db();
    propertyName = `Lodgify import test ${randomUUID().slice(0, 8)}`;
    [{ id: propertyId }] = await sql<{ id: string }[]>`
      INSERT INTO properties (slug, name, max_guests, base_nightly_pence, rate_source, lodgify_property_id, lodgify_room_type_id)
      VALUES (${`test-${randomUUID().slice(0, 8)}`}, ${propertyName}, 4, 10000, 'LODGIFY', ${lodgifyPropertyId}, 1)
      RETURNING id
    `;
    // What Lodgify's calendar feed shows for the same stay: dates only.
    const [{ id: feedId }] = await sql<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url)
      VALUES (${propertyId}, 'LODGIFY', 'Lodgify', ${`https://feeds.test/${randomUUID()}.ics`}) RETURNING id
    `;
    await sql`
      INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, summary, status, content_hash) VALUES
        (${feedId}, ${propertyId}, 'matched', '2041-03-01', '2041-03-04', 'Closed Period', 'ACTIVE', 'x'),
        (${feedId}, ${propertyId}, 'unmatched', '2041-04-01', '2041-04-03', 'Closed Period', 'ACTIVE', 'x')
    `;
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("copies guest names and countries, and shows them against the calendar's dates", async () => {
    const fetchMock = stubLodgify([
      lodgifyBooking(lodgifyPropertyId + 1, "2041-03-01", "2041-03-04"),
      lodgifyBooking(lodgifyPropertyId + 2, "2041-05-01", "2041-05-03", { status: "Declined" }),
      // Another account's property: ignored.
      { ...lodgifyBooking(lodgifyPropertyId + 3, "2041-03-01", "2041-03-04"), property_id: 1 },
    ]);
    const outcome = await importer.importLodgifyBookings("MANUAL", "owner@example.com");
    expect(outcome).toEqual({ ok: true, imported: 2 });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v2/reservations/bookings");
    expect(fetchMock.mock.calls[0][1].headers["X-ApiKey"]).toBe("test-key");

    const stored = await dbMod.db()`SELECT * FROM lodgify_bookings WHERE property_id = ${propertyId}`;
    expect(JSON.stringify(stored)).not.toMatch(/hidden@example\.com|901820/);

    const rows = await bookings.listBookings({ propertyId, source: null, status: "CONFIRMED", from: "2041-01-01", to: "2042-01-01" });
    expect(rows.map((r) => [r.checkIn, r.guestName, r.guestCountry, r.sourceLabel, r.guests])).toEqual([
      ["2041-03-01", `Guest ${lodgifyPropertyId + 1}`, "DE", "Booking.com (via Lodgify)", "2 ad, 1 pet"],
      ["2041-04-01", "Closed Period", null, expect.any(String), null],
    ]);

    // Filtering by Booking.com finds it even though it came through Lodgify's calendar.
    const bookingCom = await bookings.listBookings({ propertyId, source: "BOOKING_COM", status: "CONFIRMED", from: "2041-01-01", to: "2042-01-01" });
    expect(bookingCom.map((r) => r.checkIn)).toEqual(["2041-03-01"]);
  });

  it("counts confirmed stays by country and year", async () => {
    const counts = await importer.guestCountries(2041);
    const de = counts.find((c) => c.country === "DE");
    // The declined booking isn't counted.
    expect(de?.thisYear).toBe(1);
  });

  it("drops bookings removed from Lodgify, and keeps the copy when an import fails", async () => {
    stubLodgify([lodgifyBooking(lodgifyPropertyId + 2, "2041-05-01", "2041-05-03")]);
    expect((await importer.importLodgifyBookings("SCHEDULED")).ok).toBe(true);
    const ids = async () =>
      (await dbMod.db()<{ id: string }[]>`SELECT lodgify_booking_id::text AS id FROM lodgify_bookings WHERE property_id = ${propertyId}`).map((r) => Number(r.id));
    expect(await ids()).toEqual([lodgifyPropertyId + 2]);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 500 })));
    expect(await importer.importLodgifyBookings("SCHEDULED")).toEqual({ ok: false, imported: 0, error: "Lodgify returned HTTP 500." });
    stubLodgify([]);
    expect((await importer.importLodgifyBookings("SCHEDULED")).ok).toBe(false);
    expect(await ids()).toEqual([lodgifyPropertyId + 2]);
    expect((await importer.lastBookingImport())?.status).toBe("ERROR");
  });
});
