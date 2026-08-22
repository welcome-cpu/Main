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
 * where available is 0 or 1.
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
        start: period.start,
        end: period.end,
        available: Boolean(period.available),
      });
    }
  }
  return periods;
}

async function fetchAvailability(rentalId: string, start: string, end: string) {
  if (!LODGIFY_API_KEY) {
    throw new Error("Lodgify is not configured.");
  }

  const url = new URL(`${LODGIFY_BASE_URL}/v2/availability/${rentalId}`);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  const res = await fetch(url, {
    headers: { "X-ApiKey": LODGIFY_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`Lodgify request failed (${res.status})`);
  }

  return normalizeAvailability(await res.json());
}

/**
 * A stay is available only if every night in [start, end) falls inside a
 * period Lodgify marked available, with no unavailable period overlapping it.
 */
export async function isRangeAvailable(
  rentalId: string,
  start: string,
  end: string
) {
  const periods = await fetchAvailability(rentalId, start, end);
  const rangeStart = new Date(start);
  const rangeEnd = new Date(end);

  return !periods.some((period) => {
    if (period.available) return false;
    const periodStart = new Date(period.start);
    const periodEnd = new Date(period.end);
    return periodStart < rangeEnd && periodEnd > rangeStart;
  });
}
