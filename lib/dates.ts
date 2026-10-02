// Date helpers for stays. Stay dates are plain local calendar dates
// ("YYYY-MM-DD") with no time or timezone attached; arithmetic is done in UTC
// so it can never be shifted by the server's timezone or by BST changes.

/**
 * Today's date (YYYY-MM-DD) in a timezone. "Today" must come from the
 * property's own clock, not the server's (which runs in UTC).
 */
export function todayInZone(timeZone: string, now: Date = new Date()) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** True for a real calendar date in YYYY-MM-DD form (rejects 2027-02-30). */
export function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (the number of nights for a stay). */
export function daysBetween(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000
  );
}

/** Offset of `timeZone` from UTC at `instant`, in milliseconds. */
function zoneOffsetMs(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/**
 * The instant at which a local wall-clock time occurs in `timeZone`,
 * e.g. ("2027-03-28", "15:00", "Europe/London") -> 14:00 UTC (BST).
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wallClock = Date.UTC(y, m - 1, d, hh, mm);
  const firstGuess = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
  // Re-check in case the first guess crossed a DST change.
  return new Date(wallClock - zoneOffsetMs(new Date(firstGuess), timeZone));
}
