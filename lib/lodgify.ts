const LODGIFY_API_KEY = process.env.LODGIFY_API_KEY;
const LODGIFY_BASE_URL = "https://api.lodgify.com";

export function isLodgifyConfigured() {
  return Boolean(LODGIFY_API_KEY);
}

type AvailabilityPeriod = {
  start: string;
  end: string;
  available: boolean;
};

/**
 * Verified against live data: Lodgify's /v2/availability/{propertyId} returns
 * an array of room-type entries, each with periods: [{ start, end, available }],
 * where available is 0 or 1. Both dates are nights and both are included: a
 * booking arriving 2 Nov and leaving 6 Nov is the period 2 Nov–5 Nov.
 */
function normalizeAvailability(raw: unknown): AvailabilityPeriod[] {
  if (!Array.isArray(raw)) return [];

  const periods: AvailabilityPeriod[] = [];
  for (const entry of raw) {
    const entryPeriods = (entry as { periods?: unknown[] })?.periods;
    if (!Array.isArray(entryPeriods)) continue;
    for (const p of entryPeriods) {
      const period = p as {
        start?: string;
        end?: string;
        available?: number | boolean;
      };
      if (!period.start || !period.end) continue;
      periods.push({
        start: period.start.slice(0, 10),
        end: period.end.slice(0, 10),
        available: Boolean(period.available),
      });
    }
  }
  return periods;
}

async function lodgifyGet(path: string, params: Record<string, string>) {
  if (!LODGIFY_API_KEY) {
    throw new Error("Lodgify is not configured.");
  }

  const url = new URL(`${LODGIFY_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const res = await fetch(url, {
    headers: { "X-ApiKey": LODGIFY_API_KEY, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Lodgify request failed (${res.status})`);
  }
  return res.json();
}

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Every night in [start, end) that Lodgify doesn't show as available. */
export async function fetchUnavailableNights(rentalId: string, start: string, end: string) {
  const periods = normalizeAvailability(
    await lodgifyGet(`/v2/availability/${rentalId}`, { start, end })
  );
  const available = new Set<string>();
  for (const period of periods) {
    if (!period.available) continue;
    for (let night = period.start; night <= period.end; night = addDays(night, 1)) {
      available.add(night);
    }
  }
  const unavailable: string[] = [];
  for (let night = start; night < end; night = addDays(night, 1)) {
    if (!available.has(night)) unavailable.push(night);
  }
  return unavailable;
}

/**
 * A stay is available only if Lodgify shows every night from check-in up to
 * (not including) check-out as available.
 */
export async function isRangeAvailable(
  rentalId: string,
  start: string,
  end: string
) {
  return (await fetchUnavailableNights(rentalId, start, end)).length === 0;
}

export type StayLimits = {
  /** Shortest stay for a check-in on each date where it differs from the default. */
  minNightsByArrival: Record<string, number>;
  defaultMinNights: number;
};

/**
 * Minimum stays from Lodgify's /v2/rates/calendar. Shape verified against
 * live data: { calendar_items: [{ date, prices: [{ min_stay, max_stay }] }] },
 * one item with date null being the default, and each date having a price
 * band per length of stay. The shortest band's minimum is the minimum stay.
 */
export async function fetchStayLimits(
  rentalId: string,
  roomTypeId: string,
  start: string,
  end: string
): Promise<StayLimits> {
  const raw = (await lodgifyGet("/v2/rates/calendar", {
    HouseId: rentalId,
    RoomTypeId: roomTypeId,
    StartDate: start,
    EndDate: end,
  })) as { calendar_items?: { date?: string | null; prices?: { min_stay?: number }[] }[] };

  const minOf = (prices: { min_stay?: number }[] | undefined) => {
    const mins = (prices ?? [])
      .map((p) => p.min_stay)
      .filter((n): n is number => typeof n === "number" && n > 0);
    return mins.length ? Math.min(...mins) : null;
  };

  let defaultMinNights = 1;
  const byDate: Record<string, number> = {};
  for (const item of raw.calendar_items ?? []) {
    const min = minOf(item.prices);
    if (min === null) continue;
    if (!item.date) defaultMinNights = min;
    else byDate[item.date.slice(0, 10)] = min;
  }
  const minNightsByArrival = Object.fromEntries(
    Object.entries(byDate).filter(([, min]) => min !== defaultMinNights)
  );
  return { minNightsByArrival, defaultMinNights };
}
