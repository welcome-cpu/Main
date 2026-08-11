const LODGIFY_API_KEY = process.env.LODGIFY_API_KEY;
const LODGIFY_BASE_URL = "https://api.lodgify.com";

const PROPERTY_IDS: Record<string, string | undefined> = {
  "muckle-view": process.env.LODGIFY_PROPERTY_ID_MUCKLE_VIEW,
  "murray-cottage": process.env.LODGIFY_PROPERTY_ID_MURRAY_COTTAGE,
};

export function isLodgifyConfigured(slug: string) {
  return Boolean(LODGIFY_API_KEY && PROPERTY_IDS[slug]);
}

export type AvailabilityPeriod = {
  start: string;
  end: string;
  available: boolean;
};

/**
 * Lodgify's /v2/availability/{propertyId} response shape is unverified against
 * live data (their docs site blocked automated access during research). This
 * assumes an array of { periods: [{ start, end, available }] } entries, which
 * is the common shape for this class of PMS API. Confirm and adjust once a
 * real API key is available.
 */
export function normalizeAvailability(raw: unknown): AvailabilityPeriod[] {
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

export async function fetchAvailability(slug: string, start: string, end: string) {
  const propertyId = PROPERTY_IDS[slug];
  if (!LODGIFY_API_KEY || !propertyId) {
    throw new Error("Lodgify is not configured for this property.");
  }

  const url = new URL(`${LODGIFY_BASE_URL}/v2/availability/${propertyId}`);
  url.searchParams.set("start", start);
  url.searchParams.set("end", end);

  const res = await fetch(url, {
    headers: { "X-ApiKey": LODGIFY_API_KEY },
  });

  if (!res.ok) {
    throw new Error(`Lodgify request failed (${res.status})`);
  }

  return res.json();
}
