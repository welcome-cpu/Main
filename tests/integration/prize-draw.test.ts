import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL) && TEST_URL !== process.env.DATABASE_URL;

type Db = typeof import("@/lib/db/client");
type Draw = typeof import("@/lib/prize-draw");
type Route = typeof import("@/app/api/prize-draw/route");

let dbMod: Db;
let draw: Draw;
let route: Route;

const admin = { id: randomUUID(), email: "test@example.com", displayName: null, role: "OWNER" as const };

const post = (body: unknown) =>
  route.POST(
    new Request("http://localhost/api/prize-draw", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.9.${Math.floor(Math.random() * 250)}.1` },
      body: JSON.stringify(body),
    })
  );

describe.runIf(enabled)("prize draw (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    delete process.env.TURNSTILE_SECRET_KEY;
    dbMod = await import("@/lib/db/client");
    draw = await import("@/lib/prize-draw");
    route = await import("@/app/api/prize-draw/route");
  });
  afterAll(async () => {
    await dbMod?.db().end();
  });

  it("records an entry once, and the owner can verify it", async () => {
    const email = `draw-${randomUUID().slice(0, 8)}@example.com`;
    const res = await post({ googleName: "Jo Smith", email, propertySlug: "muckle-view" });
    expect(res.status).toBe(200);
    expect((await post({ googleName: "jo smith", email: email.toUpperCase(), propertySlug: "muckle-view" })).status).toBe(200);

    const mine = (await draw.listPrizeDrawEntries(draw.currentDrawYear())).filter((e) => e.email.toLowerCase() === email);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ googleName: "Jo Smith", propertySlug: "muckle-view", status: "PENDING" });

    await draw.setPrizeDrawEntryStatus(admin, mine[0].id, "VERIFIED");
    const [after] = await dbMod.db()<{ status: string; reviewedBy: string | null }[]>`
      SELECT status, reviewed_by FROM prize_draw_entries WHERE id = ${mine[0].id}
    `;
    expect(after).toEqual({ status: "VERIFIED", reviewedBy: admin.email });

    await dbMod.db()`DELETE FROM prize_draw_entries WHERE id = ${mine[0].id}`;
  });

  it("refuses an entry without a valid email", async () => {
    const res = await post({ googleName: "Jo", email: "not-an-email" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
  });
});
