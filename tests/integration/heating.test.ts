import { randomUUID } from "node:crypto";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { HeatingSchedule, HotWaterSchedule } from "@/lib/heating/hive-schedule";

const TEST_URL = process.env.TEST_DATABASE_URL;
const enabled = Boolean(TEST_URL);

let dbMod: typeof import("@/lib/db/client");
let run: typeof import("@/lib/heating/run");

const admin = { id: randomUUID(), email: "owner@example.com", displayName: null, role: "OWNER" as const };
const day = [
  { start: 420, value: { target: 20 } },
  { start: 1320, value: { target: 16 } },
];
const schedule = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, day]),
) as HeatingSchedule;
const water = [
  { start: 360, value: { status: "ON" } },
  { start: 540, value: { status: "OFF" } },
];
const hotWaterSchedule = Object.fromEntries(
  ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((d) => [d, water]),
) as HotWaterSchedule;

/** What one planned change does on the pretend Hive. */
const RESET = ["heating schedule", "heating SCHEDULE", "water schedule", "water SCHEDULE"];
const OFF = ["heating OFF", "water OFF"];

/** A pretend Hive that records what it was told. `failWater` makes only the hot water fail. */
function fakeHive() {
  const f = {
    calls: [] as string[],
    fail: false,
    failWater: false,
    connect: async () => {
      const step = (name: string, water = false) => {
        if (f.fail || (water && f.failWater)) throw new Error("Hive returned 500");
        f.calls.push(name);
      };
      return {
        async setHeatingSchedule() {
          step("heating schedule");
        },
        async setHeatingMode(mode: "SCHEDULE" | "OFF") {
          step(`heating ${mode}`);
        },
        async setHotWaterSchedule() {
          step("water schedule", true);
        },
        async setHotWaterMode(mode: "SCHEDULE" | "OFF") {
          step(`water ${mode}`, true);
        },
      };
    },
  };
  return f;
}

let propertyId: string;
const at = (iso: string) => new Date(iso);

async function stay(start: string, end: string) {
  await dbMod.db()`
    INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
    VALUES (${propertyId}, ${start}, ${end}, 'Heating test stay', 'owner')
  `;
}

async function tick(hive: ReturnType<typeof fakeHive>, now: Date) {
  const [outcome] = await run.runHeating({ trigger: "SCHEDULED", now, propertyId, connect: hive.connect });
  return outcome;
}

describe.runIf(enabled)("heating control (database)", () => {
  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_URL;
    dbMod = await import("@/lib/db/client");
    run = await import("@/lib/heating/run");
  });

  beforeEach(async () => {
    const slug = `heat-${randomUUID().slice(0, 8)}`;
    [{ id: propertyId }] = await dbMod.db()<{ id: string }[]>`
      INSERT INTO properties (slug, name, is_active, max_guests, base_nightly_pence, default_min_nights,
        deposit_percent, balance_due_days_before, booking_window_days, advance_notice_hours)
      VALUES (${slug}, ${"Heating " + slug}, true, 6, 15000, 2, 50, 7, 6000, 0) RETURNING id
    `;
    await dbMod.db()`
      INSERT INTO heating_controls (property_id, standard_schedule, standard_hot_water_schedule, schedule_saved_at, schedule_saved_by)
      VALUES (${propertyId}, ${dbMod.db().json(schedule)}, ${dbMod.db().json(hotWaterSchedule)}, now(), 'owner@example.com')
    `;
  });

  it("does nothing while switched off", async () => {
    const hive = fakeHive();
    await stay("2041-01-10", "2041-01-13");
    expect((await tick(hive, at("2041-01-09T19:00:00Z"))).result).toBe("DISABLED");
    expect(hive.calls).toEqual([]);
  });

  it("refuses to switch on unless both standard schedules are saved", async () => {
    await dbMod.db()`UPDATE heating_controls SET standard_hot_water_schedule = NULL WHERE property_id = ${propertyId}`;
    expect(await run.setHeatingEnabled(admin, propertyId, true)).toEqual({ error: "Save the standard schedules first." });
    await dbMod.db()`UPDATE heating_controls SET standard_schedule = NULL WHERE property_id = ${propertyId}`;
    expect(await run.setHeatingEnabled(admin, propertyId, true)).toEqual({ error: "Save the standard schedules first." });
  });

  it("resets before each guest, stays on for short gaps and turns off for long ones", async () => {
    const hive = fakeHive();
    await stay("2041-01-10", "2041-01-13");
    await stay("2041-01-15", "2041-01-17"); // 2-day gap: stays on
    await stay("2041-01-25", "2041-01-27"); // 8-day gap: off in between
    await run.setHeatingEnabled(admin, propertyId, true);

    // Switched on before anything was due.
    expect((await tick(hive, at("2041-01-08T12:00:00Z"))).result).toBe("NOTHING_DUE");

    expect(await tick(hive, at("2041-01-09T18:05:00Z"))).toMatchObject({ result: "BASELINE", key: "reset:2041-01-10" });
    expect(hive.calls).toEqual([]);

    expect(await tick(hive, at("2041-01-14T18:05:00Z"))).toMatchObject({ result: "DONE", key: "reset:2041-01-15", action: "RESET" });
    expect(hive.calls).toEqual(RESET);

    // Hourly runs in between change nothing.
    expect((await tick(hive, at("2041-01-15T09:05:00Z"))).result).toBe("UP_TO_DATE");

    expect(await tick(hive, at("2041-01-17T11:05:00Z"))).toMatchObject({ result: "DONE", key: "off:2041-01-17", action: "OFF" });
    expect(hive.calls).toEqual([...RESET, ...OFF]);

    expect(await tick(hive, at("2041-01-24T18:05:00Z"))).toMatchObject({ result: "DONE", key: "reset:2041-01-25" });
    expect(hive.calls.slice(RESET.length + OFF.length)).toEqual(RESET);
  });

  it("turns the heating off again when the next guest cancels after their reset", async () => {
    const hive = fakeHive();
    await stay("2041-02-01", "2041-02-03");
    await run.setHeatingEnabled(admin, propertyId, true);
    await tick(hive, at("2041-01-31T18:05:00Z")); // starting point
    expect((await tick(hive, at("2041-02-03T11:05:00Z"))).result).toBe("DONE"); // off
    await stay("2041-02-10", "2041-02-12");
    expect((await tick(hive, at("2041-02-09T18:05:00Z"))).result).toBe("DONE"); // reset for the new guest
    await dbMod.db()`DELETE FROM manual_blocks WHERE property_id = ${propertyId} AND start_date = '2041-02-10'`;
    expect(await tick(hive, at("2041-02-09T19:05:00Z"))).toMatchObject({ result: "DONE", key: "off:2041-02-03", action: "OFF" });
    expect(hive.calls).toEqual([...OFF, ...RESET, ...OFF]);
  });

  it("records a failure, emails the owner once, and retries on the next run", async () => {
    const hive = fakeHive();
    process.env.CONTACT_MAILBOX ??= "owner@example.com";
    await stay("2041-03-01", "2041-03-03");
    await run.setHeatingEnabled(admin, propertyId, true);
    await tick(hive, at("2041-02-28T18:05:00Z")); // starting point

    hive.fail = true;
    expect(await tick(hive, at("2041-03-03T11:05:00Z"))).toMatchObject({ result: "FAILED", key: "off:2041-03-03" });
    expect((await tick(hive, at("2041-03-03T12:05:00Z"))).result).toBe("FAILED");
    const emails = await dbMod.db()`SELECT 1 FROM emails WHERE dedupe_key = ${`heating-failed:${propertyId}:off:2041-03-03`}`;
    expect(emails.length).toBe(1);

    hive.fail = false;
    expect((await tick(hive, at("2041-03-03T13:05:00Z"))).result).toBe("DONE");
    expect(hive.calls).toEqual(OFF);
    await dbMod.db()`DELETE FROM emails WHERE dedupe_key LIKE ${`heating-failed:${propertyId}:%`}`;
  });

  it("retries the whole change when only the hot water fails", async () => {
    const hive = fakeHive();
    await stay("2041-05-01", "2041-05-03");
    await stay("2041-05-10", "2041-05-12");
    await run.setHeatingEnabled(admin, propertyId, true);
    await tick(hive, at("2041-04-30T18:05:00Z")); // starting point

    hive.failWater = true;
    expect((await tick(hive, at("2041-05-09T18:05:00Z"))).result).toBe("FAILED");
    expect(hive.calls).toEqual(["heating schedule", "heating SCHEDULE"]);

    hive.failWater = false;
    expect((await tick(hive, at("2041-05-09T19:05:00Z"))).result).toBe("DONE");
    expect(hive.calls.slice(2)).toEqual(RESET);
    await dbMod.db()`DELETE FROM emails WHERE dedupe_key LIKE ${`heating-failed:${propertyId}:%`}`;
  });

  it("starts afresh when switched back on, without resetting a guest who's already in", async () => {
    const hive = fakeHive();
    await stay("2041-04-01", "2041-04-05");
    await run.setHeatingEnabled(admin, propertyId, true);
    await tick(hive, at("2041-03-30T12:00:00Z"));
    await run.setHeatingEnabled(admin, propertyId, false);
    await run.setHeatingEnabled(admin, propertyId, true);
    expect((await tick(hive, at("2041-04-02T12:00:00Z"))).result).toBe("BASELINE");
    expect(hive.calls).toEqual([]);
  });
});
