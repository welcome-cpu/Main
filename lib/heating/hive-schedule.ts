// Hive's weekly schedules: each day is a list of slots, each slot a start time
// (minutes past midnight) and a value. Heating slots set a temperature, hot
// water slots switch it on or off. Shape taken from the open-source Pyhive
// library (Pyhass/Pyhive, devices/schedule.py).

export const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Day = (typeof DAYS)[number];

export type HeatingSlot = { start: number; value: { target: number } };
export type HeatingSchedule = Record<Day, HeatingSlot[]>;
export type HotWaterSlot = { start: number; value: { status: "ON" | "OFF" } };
export type HotWaterSchedule = Record<Day, HotWaterSlot[]>;

export const MIN_TARGET = 5;
export const MAX_TARGET = 32;

function parseWeek<V>(raw: unknown, readValue: (value: unknown) => V | null): Record<Day, { start: number; value: V }[]> | null {
  if (!raw || typeof raw !== "object") return null;
  const out = {} as Record<Day, { start: number; value: V }[]>;
  for (const day of DAYS) {
    const slots = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(slots) || slots.length === 0) return null;
    const clean: { start: number; value: V }[] = [];
    for (const slot of slots) {
      const start = (slot as { start?: unknown })?.start;
      const value = readValue((slot as { value?: unknown })?.value);
      if (!Number.isInteger(start) || (start as number) < 0 || (start as number) > 1439 || value === null) return null;
      clean.push({ start: start as number, value });
    }
    clean.sort((a, b) => a.start - b.start);
    if (new Set(clean.map((s) => s.start)).size !== clean.length) return null;
    out[day] = clean;
  }
  return out;
}

/** A clean copy of a Hive heating schedule, or null if it isn't one we'd send back. */
export function parseHeatingSchedule(raw: unknown): HeatingSchedule | null {
  return parseWeek(raw, (v) => {
    const target = (v as { target?: unknown } | null)?.target;
    return typeof target === "number" && Number.isFinite(target) && target >= MIN_TARGET && target <= MAX_TARGET ? { target } : null;
  });
}

/** A clean copy of a Hive hot water schedule, or null if it isn't one we'd send back. */
export function parseHotWaterSchedule(raw: unknown): HotWaterSchedule | null {
  return parseWeek(raw, (v) => {
    const status = (v as { status?: unknown } | null)?.status;
    return status === "ON" || status === "OFF" ? { status } : null;
  });
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dayName = (day: Day) => day[0].toUpperCase() + day.slice(1);

/** "07:00 21°, 22:00 16°" for each day, for showing in admin. */
export function describeSchedule(schedule: HeatingSchedule): { day: string; slots: string }[] {
  return DAYS.map((day) => ({ day: dayName(day), slots: schedule[day].map((s) => `${hhmm(s.start)} ${s.value.target}°`).join(", ") }));
}

/** "06:00 on, 09:00 off" for each day, for showing in admin. */
export function describeHotWaterSchedule(schedule: HotWaterSchedule): { day: string; slots: string }[] {
  return DAYS.map((day) => ({
    day: dayName(day),
    slots: schedule[day].map((s) => `${hhmm(s.start)} ${s.value.status === "ON" ? "on" : "off"}`).join(", "),
  }));
}
