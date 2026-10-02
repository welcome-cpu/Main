// Our iCal export feed against a real database (npm run test:integration).

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

let dbMod: typeof import("@/lib/db/client");
let exportsLib: typeof import("@/lib/calendar/exports");
let route: typeof import("@/app/api/ical/[token]/route");
let calendars: typeof import("@/lib/admin/calendars");
const admin = { id: randomUUID(), email: "owner@example.com", displayName: null, role: "OWNER" as const };
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const ref = () => `GC-${Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * 32)]).join("")}`;

const get = (token: string) =>
  route.GET(new Request(`https://example.test/api/ical/${token}.ics`, { headers: { "x-real-ip": randomUUID() } }), {
    params: Promise.resolve({ token: `${token}.ics` }),
  });

describe.runIf(enabled)("calendar export feed (database)", () => {
  let propertyId: string;
  const propertyName = `Export test ${randomUUID().slice(0, 8)}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    dbMod = await import("@/lib/db/client");
    exportsLib = await import("@/lib/calendar/exports");
    route = await import("@/app/api/ical/[token]/route");
    calendars = await import("@/lib/admin/calendars");

    const sql = dbMod.db();
    [{ id: propertyId }] = await sql<{ id: string }[]>`
      INSERT INTO properties (slug, name, max_guests, base_nightly_pence)
      VALUES (${`test-${randomUUID().slice(0, 8)}`}, ${propertyName}, 2, 10000) RETURNING id
    `;
    const [{ id: guestId }] = await sql<{ id: string }[]>`
      INSERT INTO guests (first_name, last_name, email, phone)
      VALUES ('Private', 'Person', 'private@example.com', '07700 900999') RETURNING id
    `;
    const insert = (status: string, checkIn: string, checkOut: string, holdIn = "30 minutes") => sql`
      INSERT INTO reservations (reference, property_id, source, status, check_in, check_out, adults, guest_id, currency,
        accommodation_pence, total_pence, deposit_pence, price_breakdown, created_by, confirmed_at, hold_expires_at,
        cancelled_at, terms_accepted_at)
      VALUES (${ref()}, ${propertyId}, 'DIRECT', ${status}, ${checkIn}, ${checkOut}, 2, ${guestId}, 'GBP', 1, 1, 0, '{}', 'test',
        ${status === "CONFIRMED" ? new Date() : null},
        ${status === "HOLD" ? sql`now() + ${holdIn}::interval` : null},
        ${status === "CANCELLED" ? new Date() : null}, now())
    `;
    await insert("CONFIRMED", "2040-03-01", "2040-03-05");
    await insert("HOLD", "2040-03-10", "2040-03-12");
    await insert("HOLD", "2040-03-20", "2040-03-22", "-1 minute");
    await insert("CANCELLED", "2040-04-01", "2040-04-03");
    await sql`
      INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
      VALUES (${propertyId}, '2040-05-01', '2040-05-03', 'Owner using it', 'owner')
    `;
    const [{ id: feedId }] = await sql<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url)
      VALUES (${propertyId}, 'LODGIFY', 'Lodgify', ${`https://feeds.test/${randomUUID()}.ics`}) RETURNING id
    `;
    // Lodgify reflecting our confirmed booking back, a genuine clash, and an unrelated import.
    await sql`
      INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, summary, status, content_hash) VALUES
        (${feedId}, ${propertyId}, 'echo', '2040-03-01', '2040-03-05', 'Closed Period', 'ACTIVE', 'x'),
        (${feedId}, ${propertyId}, 'clash', '2040-03-03', '2040-03-07', 'Someone Else', 'ACTIVE', 'x'),
        (${feedId}, ${propertyId}, 'other', '2040-06-01', '2040-06-03', 'Lodgify Guest', 'ACTIVE', 'x')
    `;
  });

  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("exports confirmed bookings, live holds and blocks, with no guest details", async () => {
    const { token } = await exportsLib.createExportLink(admin, propertyId, "Lodgify");
    const res = await get(token);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/calendar");
    const ics = await res.text();

    const dates = [...ics.matchAll(/DTSTART;VALUE=DATE:(\d{8})/g)].map((m) => m[1]);
    // Not the lapsed hold, the cancelled booking or any imported booking.
    expect(dates).toEqual(["20400301", "20400310", "20400501"]);
    for (const secret of ["Private", "Person", "private@example.com", "07700", "GC-", "Owner using it", "Lodgify Guest", "Someone Else"]) {
      expect(ics).not.toContain(secret);
    }
  });

  it("refuses unknown and revoked links", async () => {
    expect((await get("x".repeat(32))).status).toBe(404);
    const { token } = await exportsLib.createExportLink(admin, propertyId, "Airbnb");
    const [link] = (await exportsLib.listExportLinks()).filter((l) => l.propertyId === propertyId && l.label === "Airbnb");
    await exportsLib.revokeExportLink(admin, link.id);
    expect((await get(token)).status).toBe(404);
  });

  it("stores only a hash of each link's token", async () => {
    const { token } = await exportsLib.createExportLink(admin, propertyId, "Booking.com");
    const rows = await dbMod.db()<{ hex: string }[]>`
      SELECT encode(token_sha256, 'hex') AS hex FROM calendar_exports WHERE property_id = ${propertyId}
    `;
    expect(rows.some((r) => r.hex.includes(Buffer.from(token).toString("hex")))).toBe(false);
  });

  it("tells our own reflected booking apart from a genuine clash", async () => {
    const mine = (await calendars.listConflicts()).filter((c) => c.propertyName === propertyName);
    expect(mine.map((c) => [c.eventStart, c.exactMatch]).sort()).toEqual([
      ["2040-03-01", true],
      ["2040-03-03", false],
    ]);
  });
});
