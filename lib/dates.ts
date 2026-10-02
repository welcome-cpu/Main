/**
 * Today's date (YYYY-MM-DD) in a timezone. Stays and calendar events are
 * plain local dates, so "today" must come from the property's own clock,
 * not the server's (which runs in UTC).
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
