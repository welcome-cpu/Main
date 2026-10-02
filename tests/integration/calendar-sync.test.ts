// End-to-end calendar sync against a real Postgres database.
// Runs only when TEST_DATABASE_URL is set (npm run test:integration), and
// only ever against that database — never the dev or production one.

import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Sync = typeof import("@/lib/calendar/sync");
type Calendars = typeof import("@/lib/admin/calendars");

let dbMod: Db;
let sync: Sync;
let calendars: Calendars;
let propertyId: string;
let feedId: string;

function ics(...events: [uid: string, start: string, end: string][]) {
  const body = events.flatMap(([uid, s, e]) => [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTART;VALUE=DATE:${s.replaceAll("-", "")}`,
    `DTEND;VALUE=DATE:${e.replaceAll("-", "")}`,
    "SUMMARY:Test guest",
    "END:VEVENT",
  ]);
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...body, "END:VCALENDAR"].join("\r\n");
}

function serve(...responses: (() => Response)[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockImplementationOnce(async () => r());
  vi.stubGlobal("fetch", fn);
}
const ok = (text: string) => () => new Response(text, { status: 200 });

async function events() {
  return dbMod.db()<{ id: string; uid: string; status: string; startDate: string; endDate: string }[]>`
    SELECT id, uid, status, start_date, end_date FROM external_events
    WHERE feed_id = ${feedId} ORDER BY uid
  `;
}

describe.runIf(enabled)("calendar sync (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    dbMod = await import("@/lib/db/client");
    sync = await import("@/lib/calendar/sync");
    calendars = await import("@/lib/admin/calendars");

    const sql = dbMod.db();
    const slug = `test-${randomUUID().slice(0, 8)}`;
    [{ id: propertyId }] = await sql<{ id: string }[]>`
      INSERT INTO properties (slug, name, max_guests, base_nightly_pence)
      VALUES (${slug}, ${"Integration " + slug}, 2, 10000) RETURNING id
    `;
    [{ id: feedId }] = await sql<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url)
      VALUES (${propertyId}, 'AIRBNB', 'Test feed', ${`https://feeds.test/${slug}.ics`}) RETURNING id
    `;
  });

  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    // Test properties are left disabled on the test branch: the audit log is
    // append-only, so properties with history can't be deleted.
    await dbMod?.db().end();
  });

  it("imports new events", async () => {
    serve(ok(ics(["a", "2030-02-01", "2030-02-04"], ["b", "2030-03-01", "2030-03-05"])));
    const outcome = await sync.syncFeed(feedId, "MANUAL", "test@example.com");
    expect(outcome).toMatchObject({ ok: true, added: 2, updated: 0, removed: 0 });
    expect((await events()).map((e) => [e.uid, e.status])).toEqual([
      ["a", "ACTIVE"],
      ["b", "ACTIVE"],
    ]);
  });

  it("is idempotent: re-importing creates no duplicates", async () => {
    const before = await events();
    serve(ok(ics(["a", "2030-02-01", "2030-02-04"], ["b", "2030-03-01", "2030-03-05"])));
    const outcome = await sync.syncFeed(feedId, "SCHEDULED");
    expect(outcome).toMatchObject({ ok: true, added: 0, updated: 0, removed: 0 });
    expect(await events()).toEqual(before);
  });

  it("updates changed events in place and marks missing ones removed", async () => {
    const [aBefore] = await events();
    serve(ok(ics(["a", "2030-02-01", "2030-02-06"], ["c", "2030-04-01", "2030-04-03"])));
    const outcome = await sync.syncFeed(feedId, "MANUAL", "test@example.com");
    expect(outcome).toMatchObject({ ok: true, added: 1, updated: 1, removed: 1 });

    const after = await events();
    const a = after.find((e) => e.uid === "a")!;
    expect(a.id).toBe(aBefore.id);
    expect(a.endDate).toBe("2030-02-06");
    expect(after.find((e) => e.uid === "b")!.status).toBe("REMOVED");
    expect(after.find((e) => e.uid === "c")!.status).toBe("ACTIVE");
  });

  it("keeps existing events and records the error when the fetch fails", async () => {
    const before = await events();
    serve(() => new Response("Server error", { status: 503 }));
    const outcome = await sync.syncFeed(feedId, "SCHEDULED");
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toContain("503");
    expect(await events()).toEqual(before);

    const [feed] = await dbMod.db()<{ lastStatus: string; consecutiveFailures: number }[]>`
      SELECT last_status, consecutive_failures FROM calendar_feeds WHERE id = ${feedId}
    `;
    expect(feed).toEqual({ lastStatus: "ERROR", consecutiveFailures: 1 });
    const [audit] = await dbMod.db()`
      SELECT 1 FROM audit_log WHERE action = 'calendar.sync_failed' AND entity_id = ${feedId}
    `;
    expect(audit).toBeDefined();
  });

  it("keeps existing events when the feed returns an error page instead of a calendar", async () => {
    const before = await events();
    serve(ok("<html><body>Maintenance</body></html>"));
    expect((await sync.syncFeed(feedId, "SCHEDULED")).ok).toBe(false);
    expect(await events()).toEqual(before);
  });

  it("resets the failure count after a successful sync", async () => {
    serve(ok(ics(["a", "2030-02-01", "2030-02-06"], ["c", "2030-04-01", "2030-04-03"])));
    expect((await sync.syncFeed(feedId, "SCHEDULED")).ok).toBe(true);
    const [feed] = await dbMod.db()<{ lastStatus: string; consecutiveFailures: number }[]>`
      SELECT last_status, consecutive_failures FROM calendar_feeds WHERE id = ${feedId}
    `;
    expect(feed).toEqual({ lastStatus: "OK", consecutiveFailures: 0 });
  });

  it("handles two simultaneous syncs without duplicating events", async () => {
    const feed = ok(ics(["a", "2030-02-01", "2030-02-06"], ["c", "2030-04-01", "2030-04-03"], ["d", "2030-05-01", "2030-05-02"]));
    serve(feed, feed);
    const [one, two] = await Promise.all([
      sync.syncFeed(feedId, "SCHEDULED"),
      sync.syncFeed(feedId, "SCHEDULED"),
    ]);
    expect(one.ok && two.ok).toBe(true);
    expect(one.added + two.added).toBe(1);
    const rows = await events();
    expect(rows.filter((e) => e.uid === "d")).toHaveLength(1);
  });

  it("never changes a reservation, and reports an overlap as a conflict", async () => {
    const sql = dbMod.db();
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const reference = `GC-${Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * 32)]).join("")}`;
    const [reservation] = await sql<{ id: string; updatedAt: Date }[]>`
      INSERT INTO reservations (reference, property_id, source, status, check_in, check_out,
        adults, currency, accommodation_pence, total_pence, deposit_pence, price_breakdown,
        created_by, confirmed_at)
      VALUES (${reference}, ${propertyId}, 'MANUAL', 'CONFIRMED', '2030-06-10', '2030-06-14',
        2, 'GBP', 40000, 40000, 0, '{}', 'test', now())
      RETURNING id, updated_at
    `;

    serve(ok(ics(["a", "2030-02-01", "2030-02-06"], ["c", "2030-04-01", "2030-04-03"], ["d", "2030-05-01", "2030-05-02"], ["e", "2030-06-12", "2030-06-15"])));
    expect((await sync.syncFeed(feedId, "SCHEDULED")).ok).toBe(true);

    const [after] = await sql<{ status: string; updatedAt: Date }[]>`
      SELECT status, updated_at FROM reservations WHERE id = ${reservation.id}
    `;
    expect(after).toEqual({ status: "CONFIRMED", updatedAt: reservation.updatedAt });

    const conflicts = await calendars.listConflicts();
    expect(conflicts.some((c) => c.reservationReference === reference)).toBe(true);
  });
});
