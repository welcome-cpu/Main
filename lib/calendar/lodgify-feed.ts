// Reads a property's calendar from Lodgify's API (/v2/availability) in
// place of its iCal export. Verified against live data: one entry per room
// type, each with periods { start, end, available (0/1), bookings: [{ id }],
// closed_period }. Both dates are nights and both are included, so a stay
// leaving on 6 Nov is a period ending 5 Nov. Back-to-back bookings are
// separate periods.

import { addDays, isValidDate } from "@/lib/dates";
import type { ParsedEvent } from "@/lib/calendar/ics-parse";

export class LodgifyFeedError extends Error {}

type RawPeriod = {
  start?: unknown;
  end?: unknown;
  available?: unknown;
  bookings?: { id?: unknown }[] | null;
  closed_period?: { name?: unknown } | null;
};

/** Unavailable periods as events, the same shape the iCal import produces. */
export function lodgifyAvailabilityToEvents(raw: unknown): ParsedEvent[] {
  if (!Array.isArray(raw)) throw new LodgifyFeedError("Lodgify returned an unexpected calendar format.");

  const events = new Map<string, ParsedEvent>();
  for (const entry of raw) {
    const periods = (entry as { periods?: unknown })?.periods;
    if (!Array.isArray(periods)) throw new LodgifyFeedError("Lodgify returned an unexpected calendar format.");
    for (const p of periods as RawPeriod[]) {
      if (p?.available !== 0 && p?.available !== false) continue;
      const start = String(p.start ?? "").slice(0, 10);
      const lastNight = String(p.end ?? "").slice(0, 10);
      if (!isValidDate(start) || !isValidDate(lastNight) || lastNight < start) continue;

      const bookingIds = (p.bookings ?? []).map((b) => b?.id).filter((id) => typeof id === "number" || typeof id === "string");
      const closedName = typeof p.closed_period?.name === "string" ? p.closed_period.name : null;
      // Bookings keep their Lodgify ID, so a changed stay updates in place.
      // Other closed dates are known only by where they start.
      const uid = bookingIds.length ? `lodgify-booking-${bookingIds.join("-")}` : `lodgify-closed-${start}`;
      events.set(uid, {
        uid,
        startDate: start,
        endDate: addDays(lastNight, 1),
        summary: bookingIds.length
          ? `Lodgify booking ${bookingIds.join(", ")}`
          : closedName
            ? `Closed in Lodgify: ${closedName.slice(0, 200)}`
            : "Not available in Lodgify",
        cancelled: false,
      });
    }
  }
  return [...events.values()];
}

/** The property's calendar from `start` to `end`, as events. */
export async function fetchLodgifyCalendar(lodgifyPropertyId: number, start: string, end: string) {
  const key = process.env.LODGIFY_API_KEY;
  if (!key) throw new LodgifyFeedError("LODGIFY_API_KEY isn't set for this deployment.");
  const url = new URL(`https://api.lodgify.com/v2/availability/${lodgifyPropertyId}`);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { "X-ApiKey": key, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new LodgifyFeedError("Couldn't reach Lodgify.");
  }
  if (!res.ok) throw new LodgifyFeedError(`Lodgify returned HTTP ${res.status}.`);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new LodgifyFeedError("Lodgify returned an unreadable calendar.");
  }
  return { events: lodgifyAvailabilityToEvents(body), httpStatus: res.status };
}
