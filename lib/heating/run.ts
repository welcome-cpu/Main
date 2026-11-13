import "server-only";

// Keeps a property's heating and hot water in line with its bookings. Run hourly by the cron
// job, or from admin with "Check now".
//
// Each run works out the most recent change that has fallen due (see plan.ts)
// and compares it with the last change actually made. If they differ, it makes
// the change. So a missed run catches up on the next one, a cancelled booking
// puts the heating back to off, and the owner's own changes in the Hive app are
// left alone until the next planned change.

import type { AdminUser } from "@/lib/admin/users";
import { recordAudit } from "@/lib/audit";
import { addDays, todayInZone } from "@/lib/dates";
import { db, type Sql } from "@/lib/db/client";
import { escapeHtml } from "@/lib/email/templates";
import { ownerMailbox } from "@/lib/email/graph";
import { enqueueEmail } from "@/lib/email/outbox";
import { HiveError, HiveHeating, isHiveConfigured, type HiveStatus } from "@/lib/heating/hive";
import {
  parseHeatingSchedule,
  parseHotWaterSchedule,
  type HeatingSchedule,
  type HotWaterSchedule,
} from "@/lib/heating/hive-schedule";
import { latestDue, planTransitions, upcoming, type Stay, type Transition } from "@/lib/heating/plan";
import { guestStays, type UnavailableRow } from "@/lib/heating/stays";
import { logError } from "@/lib/log";

type Control = {
  propertyId: string;
  propertyName: string;
  timezone: string;
  checkOutTime: string;
  enabled: boolean;
  standardSchedule: unknown;
  standardHotWaterSchedule: unknown;
  scheduleSavedAt: Date | null;
  scheduleSavedBy: string | null;
};

export type HeatingAction = {
  id: string;
  transitionKey: string;
  action: "RESET" | "OFF";
  dueAt: Date;
  status: "DONE" | "FAILED" | "SKIPPED";
  error: string | null;
  trigger: "SCHEDULED" | "MANUAL";
  actor: string | null;
  createdAt: Date;
};

export type RunOutcome =
  | { propertyName: string; result: "NOTHING_DUE" | "UP_TO_DATE" | "BASELINE" | "DISABLED"; key?: string }
  | { propertyName: string; result: "DONE"; key: string; action: "RESET" | "OFF" }
  | { propertyName: string; result: "FAILED"; key: string; error: string };

/** How far back and ahead to look at bookings. Beyond the 3-day gap rule either way. */
const LOOK_BACK_DAYS = 30;
const LOOK_AHEAD_DAYS = 120;

async function loadControls(sql: Sql, propertyId?: string): Promise<Control[]> {
  return sql<Control[]>`
    SELECT c.property_id, p.name AS property_name, p.timezone, to_char(p.check_out_time, 'HH24:MI') AS check_out_time,
           c.enabled, c.standard_schedule, c.standard_hot_water_schedule, c.schedule_saved_at, c.schedule_saved_by
    FROM heating_controls c JOIN properties p ON p.id = c.property_id
    WHERE ${propertyId ? sql`c.property_id = ${propertyId}` : sql`true`}
    ORDER BY p.name
  `;
}

/**
 * The stays the heating follows: bookings taken here, bookings imported from
 * Lodgify and other calendars, and manual blocks, but not Lodgify's
 * preparation nights either side of a booking (see stays.ts). Owner blocks
 * and unexplained closed dates count as stays, because a cold cottage for a
 * guest is worse than heating an empty one.
 */
export async function loadStays(sql: Sql, propertyId: string, from: string, to: string): Promise<Stay[]> {
  const rows = await sql<UnavailableRow[]>`
    SELECT 'RESERVATION' AS source, check_in::text AS start, check_out::text AS end, NULL AS uid, NULL AS summary FROM reservations
      WHERE property_id = ${propertyId} AND status = 'CONFIRMED' AND check_out >= ${from} AND check_in <= ${to}
    UNION ALL
    SELECT 'EXTERNAL', start_date::text, end_date::text, uid, summary FROM external_events
      WHERE property_id = ${propertyId} AND status = 'ACTIVE' AND end_date >= ${from} AND start_date <= ${to}
    UNION ALL
    SELECT 'MANUAL_BLOCK', start_date::text, end_date::text, NULL, NULL FROM manual_blocks
      WHERE property_id = ${propertyId} AND end_date >= ${from} AND start_date <= ${to}
  `;
  return guestStays([...rows]);
}

async function transitionsFor(sql: Sql, c: Control, now: Date): Promise<Transition[]> {
  const today = todayInZone(c.timezone, now);
  const stays = await loadStays(sql, c.propertyId, addDays(today, -LOOK_BACK_DAYS), addDays(today, LOOK_AHEAD_DAYS));
  return planTransitions(stays, { timeZone: c.timezone, checkOutTime: c.checkOutTime });
}

async function lastApplied(sql: Sql, propertyId: string) {
  const [row] = await sql<{ transitionKey: string }[]>`
    SELECT a.transition_key FROM heating_actions a
    JOIN heating_controls c ON c.property_id = a.property_id
    WHERE a.property_id = ${propertyId} AND a.status IN ('DONE', 'SKIPPED') AND a.created_at >= c.enabled_at
    ORDER BY a.created_at DESC LIMIT 1
  `;
  return row?.transitionKey ?? null;
}

/** What the runner needs from Hive. Tests pass a fake. */
export type HeatingDevice = Pick<HiveHeating, "setHeatingSchedule" | "setHeatingMode" | "setHotWaterSchedule" | "setHotWaterMode">;
type Connect = () => Promise<HeatingDevice>;

type Standards = { heating: HeatingSchedule | null; hotWater: HotWaterSchedule | null };

const standardsOf = (c: Pick<Control, "standardSchedule" | "standardHotWaterSchedule">): Standards => ({
  heating: parseHeatingSchedule(c.standardSchedule),
  hotWater: parseHotWaterSchedule(c.standardHotWaterSchedule),
});

/**
 * Makes one planned change to both the heating and the hot water. If any step
 * fails the whole change is retried next run; every step is safe to repeat.
 */
async function apply(t: Transition, standards: Standards, connect: Connect) {
  const hive = await connect();
  if (t.action === "RESET") {
    if (!standards.heating || !standards.hotWater) {
      throw new HiveError("The standard schedules aren't both saved, so nothing was changed.");
    }
    await hive.setHeatingSchedule(standards.heating);
    await hive.setHeatingMode("SCHEDULE");
    await hive.setHotWaterSchedule(standards.hotWater);
    await hive.setHotWaterMode("SCHEDULE");
  } else {
    await hive.setHeatingMode("OFF");
    await hive.setHotWaterMode("OFF");
  }
}

async function alertOwner(sql: Sql, c: Control, t: Transition, error: string) {
  const to = ownerMailbox();
  if (!to) return;
  const what =
    t.action === "RESET"
      ? "put the standard heating and hot water schedules back on for the next guest"
      : "turn the heating and hot water off after check-out";
  const text = `The website couldn't ${what} at ${c.propertyName}. Please check them in the Hive app.\n\nError: ${error}\n\nIt will keep trying every hour. See Admin > Heating.`;
  await enqueueEmail(sql, {
    reservationId: null,
    kind: "OWNER_HEATING_PROBLEM",
    // One email per planned change, however many times it's retried.
    dedupeKey: `heating-failed:${c.propertyId}:${t.key}`,
    to,
    subject: `Heating and hot water not changed at ${c.propertyName}`,
    html: `<p>${escapeHtml(text).replaceAll("\n", "<br>")}</p>`,
    text,
  });
}

async function runOne(
  sql: Sql,
  c: Control,
  now: Date,
  trigger: "SCHEDULED" | "MANUAL",
  actor: string | null,
  connect: Connect,
): Promise<RunOutcome> {
  const base = { propertyName: c.propertyName };
  if (!c.enabled) return { ...base, result: "DISABLED" };

  const due = latestDue(await transitionsFor(sql, c, now), now);
  if (!due) return { ...base, result: "NOTHING_DUE" };

  const last = await lastApplied(sql, c.propertyId);
  if (last === due.key) return { ...base, result: "UP_TO_DATE", key: due.key };

  // Switched on mid-way: take the heating as it is and start from the next change,
  // so a guest who's already in isn't reset part-way through their stay.
  if (last === null) {
    await sql`
      INSERT INTO heating_actions (property_id, transition_key, action, due_at, status, error, trigger, actor)
      VALUES (${c.propertyId}, ${due.key}, ${due.action}, ${due.at}, 'SKIPPED', 'Starting point when switched on', ${trigger}, ${actor})
    `;
    return { ...base, result: "BASELINE", key: due.key };
  }

  try {
    await apply(due, standardsOf(c), connect);
    await sql`
      INSERT INTO heating_actions (property_id, transition_key, action, due_at, status, trigger, actor)
      VALUES (${c.propertyId}, ${due.key}, ${due.action}, ${due.at}, 'DONE', ${trigger}, ${actor})
    `;
    return { ...base, result: "DONE", key: due.key, action: due.action };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    if (!(err instanceof HiveError)) logError("heating", err);
    await sql`
      INSERT INTO heating_actions (property_id, transition_key, action, due_at, status, error, trigger, actor)
      VALUES (${c.propertyId}, ${due.key}, ${due.action}, ${due.at}, 'FAILED', ${error}, ${trigger}, ${actor})
    `;
    await alertOwner(sql, c, due, error);
    return { ...base, result: "FAILED", key: due.key, error };
  }
}

/** Brings every property's heating and hot water up to date. Overlapping runs wait for each other. */
export async function runHeating(options: {
  trigger: "SCHEDULED" | "MANUAL";
  actor?: string | null;
  now?: Date;
  propertyId?: string;
  connect?: Connect;
}) {
  if (!options.connect && !isHiveConfigured()) return [];
  const connect = options.connect ?? (() => HiveHeating.connect());
  const now = options.now ?? new Date();
  return db().begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('heating_run'))`;
    const sql = tx as unknown as Sql;
    const outcomes: RunOutcome[] = [];
    for (const c of await loadControls(sql, options.propertyId)) {
      outcomes.push(await runOne(sql, c, now, options.trigger, options.actor ?? null, connect));
    }
    return outcomes;
  });
}

// ---- Admin ----

export type HeatingOverview = {
  configured: boolean;
  properties: {
    propertyId: string;
    propertyName: string;
    enabled: boolean;
    standardSchedule: HeatingSchedule | null;
    standardHotWaterSchedule: HotWaterSchedule | null;
    scheduleSavedAt: Date | null;
    scheduleSavedBy: string | null;
    live: HiveStatus | null;
    liveError: string | null;
    current: Transition | null;
    lastApplied: string | null;
    next: Transition[];
    actions: HeatingAction[];
  }[];
};

export async function getHeatingOverview(now = new Date()): Promise<HeatingOverview> {
  const sql = db();
  const configured = isHiveConfigured();
  const controls = await loadControls(sql);

  let live: HiveStatus | null = null;
  let liveError: string | null = null;
  if (configured && controls.length) {
    try {
      live = await (await HiveHeating.connect()).status();
    } catch (err) {
      liveError = err instanceof Error ? err.message : String(err);
    }
  }

  const properties = [];
  for (const c of controls) {
    const transitions = await transitionsFor(sql, c, now);
    const actions = await sql<HeatingAction[]>`
      SELECT id, transition_key, action, due_at, status, error, trigger, actor, created_at
      FROM heating_actions WHERE property_id = ${c.propertyId}
      ORDER BY created_at DESC LIMIT 20
    `;
    const standards = standardsOf(c);
    properties.push({
      propertyId: c.propertyId,
      propertyName: c.propertyName,
      enabled: c.enabled,
      standardSchedule: standards.heating,
      standardHotWaterSchedule: standards.hotWater,
      scheduleSavedAt: c.scheduleSavedAt,
      scheduleSavedBy: c.scheduleSavedBy,
      live,
      liveError,
      current: latestDue(transitions, now),
      lastApplied: await lastApplied(sql, c.propertyId),
      next: upcoming(transitions, now).slice(0, 8),
      actions: [...actions],
    });
  }
  return { configured, properties };
}

/** Saves the current Hive heating and hot water schedules as the ones every guest starts with. */
export async function saveCurrentSchedule(admin: AdminUser, propertyId: string): Promise<{ ok: true } | { error: string }> {
  let status: HiveStatus;
  try {
    status = await (await HiveHeating.connect()).status();
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  const heating = status.heating.schedule;
  const hotWater = status.hotWater?.schedule ?? null;
  if (!status.hotWater) return { error: `Nothing was saved. ${status.hotWaterError ?? "The hot water wasn't found."}` };
  if (!heating) return { error: "Hive didn't return the heating schedule in the format expected, so nothing was saved." };
  if (!hotWater) return { error: "Hive didn't return the hot water schedule in the format expected, so nothing was saved." };

  const sql = db();
  await sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE heating_controls
      SET standard_schedule = ${tx.json(heating)}, standard_hot_water_schedule = ${tx.json(hotWater)},
          schedule_saved_at = now(), schedule_saved_by = ${admin.email}, updated_at = now()
      WHERE property_id = ${propertyId}
    `;
    if (updated.count === 0) throw new Error("No heating control for that property");
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "heating.schedule_saved",
      entityType: "heating_control",
      entityId: propertyId,
      propertyId,
      details: { heating, hotWater },
    });
  });
  return { ok: true };
}

export async function setHeatingEnabled(admin: AdminUser, propertyId: string, enabled: boolean): Promise<{ ok: true } | { error: string }> {
  const sql = db();
  return sql.begin(async (tx) => {
    const [row] = await tx<Pick<Control, "standardSchedule" | "standardHotWaterSchedule">[]>`
      SELECT standard_schedule, standard_hot_water_schedule FROM heating_controls WHERE property_id = ${propertyId} FOR UPDATE
    `;
    if (!row) return { error: "No heating control for that property." };
    const standards = standardsOf(row);
    if (enabled && (!standards.heating || !standards.hotWater)) return { error: "Save the standard schedules first." };
    // Switching on (again) starts afresh from the heating as it is now: only
    // changes made after enabled_at count as "last applied".
    await tx`
      UPDATE heating_controls
      SET enabled = ${enabled}, enabled_at = CASE WHEN ${enabled} THEN now() ELSE enabled_at END, updated_at = now()
      WHERE property_id = ${propertyId}
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: enabled ? "heating.enabled" : "heating.disabled",
      entityType: "heating_control",
      entityId: propertyId,
      propertyId,
    });
    return { ok: true as const };
  });
}
