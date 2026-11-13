// Works out when the heating should change, from the dates a property is
// occupied. Pure: no database or Hive calls, so it's easy to test.
//
// The rules (agreed with the owner, Nov 2026):
// - The night before each guest arrives, put back the standard schedule and
//   switch the heating to it. Every guest gets the same schedule, whatever the
//   last guest changed.
// - When a guest leaves and nobody arrives for more than 3 days, turn the
//   heating off at check-out time.
//
// Back-to-back guests (one leaves the day the next arrives) get their reset at
// check-out time on changeover day, so the departing guest's last night is left
// alone.

import { addDays, daysBetween, zonedTimeToUtc } from "@/lib/dates";

/** Occupied nights: `start` is the arrival date, `end` the departure date. */
export type Stay = { start: string; end: string };

export type HeatingAction = "RESET" | "OFF";

export type Transition = {
  /** Identifies this change, so it's applied once: "reset:<arrival>" or "off:<departure>". */
  key: string;
  action: HeatingAction;
  at: Date;
};

export type PlanOptions = {
  timeZone: string;
  /** Property check-out time, "HH:MM". */
  checkOutTime: string;
  /** Local time the evening before arrival to reset the schedule, "HH:MM". */
  resetTime?: string;
  /** Turn off only when the gap to the next arrival is more than this many days. */
  offAfterGapDays?: number;
};

export const DEFAULT_RESET_TIME = "18:00";
export const DEFAULT_OFF_AFTER_GAP_DAYS = 3;

/**
 * Merges overlapping stays (the same booking can come in from more than one
 * calendar feed). Stays that only touch, back-to-back, are kept apart because
 * they're different guests.
 */
export function mergeStays(stays: Stay[]): Stay[] {
  const sorted = stays.filter((s) => s.end > s.start).sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const merged: Stay[] = [];
  for (const s of sorted) {
    const last = merged.at(-1);
    if (last && s.start < last.end) {
      if (s.end > last.end) last.end = s.end;
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** Every heating change the stays call for, oldest first. */
export function planTransitions(stays: Stay[], options: PlanOptions): Transition[] {
  const { timeZone, checkOutTime } = options;
  const resetTime = options.resetTime ?? DEFAULT_RESET_TIME;
  const gapDays = options.offAfterGapDays ?? DEFAULT_OFF_AFTER_GAP_DAYS;
  const merged = mergeStays(stays);
  const out: Transition[] = [];

  merged.forEach((stay, i) => {
    const previous = merged[i - 1];
    const resetAt =
      previous && previous.end === stay.start
        ? zonedTimeToUtc(stay.start, checkOutTime, timeZone)
        : zonedTimeToUtc(addDays(stay.start, -1), resetTime, timeZone);
    out.push({ key: `reset:${stay.start}`, action: "RESET", at: resetAt });

    const next = merged[i + 1];
    if (!next || daysBetween(stay.end, next.start) > gapDays) {
      out.push({ key: `off:${stay.end}`, action: "OFF", at: zonedTimeToUtc(stay.end, checkOutTime, timeZone) });
    }
  });

  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The most recent change that has fallen due: what the heating should be doing now. */
export function latestDue(transitions: Transition[], now: Date): Transition | null {
  let latest: Transition | null = null;
  for (const t of transitions) if (t.at <= now) latest = t;
  return latest;
}

/** The changes still to come. */
export function upcoming(transitions: Transition[], now: Date): Transition[] {
  return transitions.filter((t) => t.at > now);
}
