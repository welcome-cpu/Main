// Hive's weekly heating schedule: each day is a list of slots, each slot a
// start time (minutes past midnight) and a target temperature. Shape taken from
// the open-source Pyhive library (Pyhass/Pyhive, devices/schedule.py).

export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Day = (typeof DAYS)[number];
export type HeatingSlot = { start: number; value: { target: number } };
export type HeatingSchedule = Record<Day, HeatingSlot[]>;

export const MIN_TARGET = 5;
export const MAX_TARGET = 32;

/** A clean copy of a Hive heating schedule, or null if it isn't one we'd send back. */
export function parseHeatingSchedule(raw: unknown): HeatingSchedule | null {
  if (!raw || typeof raw !== "object") return null;
  const out = {} as HeatingSchedule;
  for (const day of DAYS) {
    const slots = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(slots) || slots.length === 0) return null;
    const clean: HeatingSlot[] = [];
    for (const slot of slots) {
      const start = (slot as { start?: unknown })?.start;
      const target = (slot as { value?: { target?: unknown } })?.value?.target;
      if (!Number.isInteger(start) || (start as number) < 0 || (start as number) > 1439) return null;
      if (typeof target !== "number" || !Number.isFinite(target) || target < MIN_TARGET || target > MAX_TARGET) return null;
      clean.push({ start: start as number, value: { target } });
    }
    clean.sort((a, b) => a.start - b.start);
    if (new Set(clean.map((s) => s.start)).size !== clean.length) return null;
    out[day] = clean;
  }
  return out;
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** "07:00 21°, 22:00 16°" for each day, for showing in admin. */
export function describeSchedule(schedule: HeatingSchedule): { day: string; slots: string }[] {
  return DAYS.map((day) => ({
    day: day[0].toUpperCase() + day.slice(1),
    slots: schedule[day].map((s) => `${hhmm(s.start)} ${s.value.target}°`).join(", "),
  }));
}
