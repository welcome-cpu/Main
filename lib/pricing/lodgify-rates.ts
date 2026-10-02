// Read-only copy of nightly prices and stay limits from Lodgify, used while
// Lodgify (and any pricing tool feeding it) remains the master for prices.

import { isValidDate } from "@/lib/dates";

export type ImportedNight = {
  night: string;
  pricePence: number;
  minNights: number | null;
  maxNights: number | null;
};

// Lodgify uses very large maximum stays (e.g. 1125) to mean "no limit".
// Those are dropped so the property's own maximum applies instead.
const NO_LIMIT_THRESHOLD = 365;

/**
 * Converts Lodgify's /v2/rates/calendar response. Shape verified against
 * live data: { calendar_items: [{ date, is_default, prices: [{ min_stay,
 * max_stay, price_per_day, ... }] }] }, where one item has date null (the
 * property default) and is skipped.
 */
export function normalizeLodgifyCalendar(raw: unknown): ImportedNight[] {
  const items = (raw as { calendar_items?: unknown })?.calendar_items;
  if (!Array.isArray(items)) return [];

  const nights: ImportedNight[] = [];
  for (const item of items) {
    const date = (item as { date?: unknown })?.date;
    const price = (item as { prices?: unknown[] })?.prices?.[0] as
      | { price_per_day?: unknown; min_stay?: unknown; max_stay?: unknown }
      | undefined;
    if (typeof date !== "string" || !isValidDate(date.slice(0, 10)) || !price) continue;

    const perDay = Number(price.price_per_day);
    if (!Number.isFinite(perDay) || perDay <= 0) continue;

    const min = Number(price.min_stay);
    const max = Number(price.max_stay);
    nights.push({
      night: date.slice(0, 10),
      pricePence: Math.round(perDay * 100),
      minNights: Number.isInteger(min) && min >= 1 ? min : null,
      maxNights: Number.isInteger(max) && max >= 1 && max < NO_LIMIT_THRESHOLD ? max : null,
    });
  }
  return nights;
}
