import "server-only";
import { db, isDatabaseConfigured } from "@/lib/db/client";
import { logError } from "@/lib/log";

/**
 * The lowest nightly rate over the coming year for each property, in
 * pence, keyed by slug: the "from £X/night" on the properties page. Empty
 * if the database isn't available, so callers can fall back.
 */
export async function fromPricesBySlug(): Promise<Record<string, number>> {
  if (!isDatabaseConfigured()) return {};
  try {
    const rows = await db()<{ slug: string; fromPence: number }[]>`
      SELECT p.slug, min(n.price_pence)::int AS from_pence
      FROM nightly_rates n
      JOIN properties p ON p.id = n.property_id
      WHERE p.is_active AND n.night BETWEEN current_date AND current_date + 365
        AND (n.source = 'ADMIN' OR p.rate_source = 'LODGIFY')
      GROUP BY p.slug
    `;
    return Object.fromEntries(rows.map((r) => [r.slug, r.fromPence]));
  } catch (error) {
    logError("Couldn't load from-prices for the properties page", error);
    return {};
  }
}
