// Minimal iCalendar (RFC 5545) reader for channel availability feeds
// (Airbnb, Booking.com, Lodgify...). These feeds are simple: one VEVENT per
// reservation or block, usually as all-day dates. Pure and dependency-free so
// it can be unit tested with real feed fixtures.

export type ParsedEvent = {
  uid: string;
  /** First night, YYYY-MM-DD in the property's local calendar. */
  startDate: string;
  /** Checkout day (exclusive), YYYY-MM-DD. */
  endDate: string;
  summary: string | null;
  cancelled: boolean;
};

export type ParseResult = {
  events: ParsedEvent[];
  /** Events that were skipped, with the reason. Never fatal on their own. */
  warnings: string[];
};

export class IcsParseError extends Error {}

type Property = { name: string; params: Record<string, string>; value: string };

/** Joins folded lines (a CRLF followed by a space or tab continues the line). */
function unfold(text: string): string[] {
  return text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n[ \t]/g, "")
    .split("\n")
    .filter((line) => line.length > 0);
}

function parseLine(line: string): Property | null {
  // NAME;PARAM=value;PARAM="quoted:value":VALUE — the first colon outside
  // quotes separates the name/params from the value.
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon === -1) return null;

  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

function unescapeText(value: string) {
  return value.replace(/\\([\\;,nN])/g, (_, ch: string) => (ch === "n" || ch === "N" ? "\n" : ch));
}

/** Calendar date in `timeZone` for an instant. */
function dateInZone(instant: Date, timeZone: string) {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * Converts a DTSTART/DTEND property to a local calendar date.
 * - VALUE=DATE (20260801): used as-is.
 * - UTC date-time (20260801T150000Z): converted to the property's timezone.
 * - Local or TZID date-time (20260801T150000): its written date is used.
 */
function toLocalDate(prop: Property, timeZone: string): string | null {
  const m = prop.value.trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h !== undefined && z) {
    const instant = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(s ?? 0)));
    return dateInZone(instant, timeZone);
  }
  const date = `${y}-${mo}-${d}`;
  return isValidDate(date) ? date : null;
}

export function isValidDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(date);
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Days from ISO duration like P3D or P1W (time parts are ignored). */
function durationDays(value: string): number | null {
  const m = value.match(/^P(?:(\d+)W)?(?:(\d+)D)?/);
  if (!m || (!m[1] && !m[2])) return null;
  return Number(m[1] ?? 0) * 7 + Number(m[2] ?? 0);
}

export function parseIcs(text: string, timeZone: string): ParseResult {
  const lines = unfold(text);
  if (!lines[0]?.toUpperCase().startsWith("BEGIN:VCALENDAR")) {
    throw new IcsParseError("Not an iCalendar file (missing BEGIN:VCALENDAR).");
  }
  if (!lines.some((l) => l.toUpperCase().startsWith("END:VCALENDAR"))) {
    throw new IcsParseError("iCalendar file is incomplete (missing END:VCALENDAR).");
  }

  const events: ParsedEvent[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let current: Property[] | null = null;
  let depth = 0; // nested components inside a VEVENT (e.g. VALARM)

  for (const line of lines) {
    const prop = parseLine(line);
    if (!prop) continue;

    if (prop.name === "BEGIN") {
      if (prop.value.toUpperCase() === "VEVENT" && current === null) current = [];
      else if (current !== null) depth++;
      continue;
    }
    if (prop.name === "END") {
      if (current !== null && depth > 0) {
        depth--;
      } else if (current !== null && prop.value.toUpperCase() === "VEVENT") {
        const event = buildEvent(current, timeZone, warnings);
        if (event) {
          // Duplicate UIDs within one feed: keep the last occurrence.
          const existing = seen.get(event.uid);
          if (existing !== undefined) {
            warnings.push(`Duplicate event ${event.uid} in feed; kept the last one.`);
            events[existing] = event;
          } else {
            seen.set(event.uid, events.length);
            events.push(event);
          }
        }
        current = null;
      }
      continue;
    }
    if (current !== null && depth === 0) current.push(prop);
  }

  return { events, warnings };
}

function buildEvent(props: Property[], timeZone: string, warnings: string[]): ParsedEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const uid = get("UID")?.value.trim();
  const dtstart = get("DTSTART");
  const label = uid ?? "(no UID)";

  if (!uid) {
    warnings.push("Skipped an event with no UID.");
    return null;
  }
  if (get("RRULE")) {
    warnings.push(`Skipped recurring event ${label}: repeating events aren't supported.`);
    return null;
  }
  if (!dtstart) {
    warnings.push(`Skipped event ${label}: no start date.`);
    return null;
  }

  const startDate = toLocalDate(dtstart, timeZone);
  if (!startDate) {
    warnings.push(`Skipped event ${label}: unreadable start date "${dtstart.value}".`);
    return null;
  }

  let endDate: string | null = null;
  const dtend = get("DTEND");
  const duration = get("DURATION");
  if (dtend) {
    endDate = toLocalDate(dtend, timeZone);
    if (!endDate) {
      warnings.push(`Skipped event ${label}: unreadable end date "${dtend.value}".`);
      return null;
    }
  } else if (duration) {
    const days = durationDays(duration.value);
    endDate = addDays(startDate, Math.max(days ?? 1, 1));
  } else {
    // RFC 5545: an all-day event with no end lasts one day.
    endDate = addDays(startDate, 1);
  }

  // A same-day date-time event (e.g. 10:00–14:00) still occupies that night.
  if (endDate <= startDate) {
    if (endDate === startDate && dtstart.value.includes("T")) {
      endDate = addDays(startDate, 1);
    } else {
      warnings.push(`Skipped event ${label}: it ends before it starts.`);
      return null;
    }
  }

  const summary = get("SUMMARY");
  return {
    uid,
    startDate,
    endDate,
    summary: summary ? unescapeText(summary.value).slice(0, 200) : null,
    cancelled: get("STATUS")?.value.trim().toUpperCase() === "CANCELLED",
  };
}
