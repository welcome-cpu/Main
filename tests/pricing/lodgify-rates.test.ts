import { describe, expect, it } from "vitest";
import { normalizeLodgifyCalendar } from "@/lib/pricing/lodgify-rates";

// Shape copied from a live /v2/rates/calendar response (2026-10-02).
const sample = {
  calendar_items: [
    { date: null, is_default: true, prices: [{ min_stay: 2, max_stay: 6, price_per_day: 165.0, price_per_additional_guest: 0 }] },
    { date: "2026-10-02", is_default: false, prices: [{ min_stay: 2, max_stay: 28, price_per_day: 225.0 }] },
    { date: "2026-10-03T00:00:00", is_default: false, prices: [{ min_stay: 3, max_stay: 1125, price_per_day: 147.5 }] },
    { date: "2026-10-04", is_default: false, prices: [] },
    { date: "2026-10-05", is_default: false, prices: [{ min_stay: 0, max_stay: 0, price_per_day: 0 }] },
    { date: "not a date", is_default: false, prices: [{ min_stay: 2, max_stay: 28, price_per_day: 100 }] },
  ],
  rate_settings: {},
};

describe("normalizeLodgifyCalendar", () => {
  it("converts nights to pence and keeps stay limits", () => {
    expect(normalizeLodgifyCalendar(sample)).toEqual([
      { night: "2026-10-02", pricePence: 22500, minNights: 2, maxNights: 28 },
      // 1125 is Lodgify's "no limit": dropped so the property's own maximum applies.
      { night: "2026-10-03", pricePence: 14750, minNights: 3, maxNights: null },
    ]);
  });

  it("rounds prices to the nearest penny without floating-point drift", () => {
    const r = normalizeLodgifyCalendar({ calendar_items: [{ date: "2026-10-02", prices: [{ price_per_day: 132.847 }] }] });
    expect(r[0].pricePence).toBe(13285);
  });

  it("returns nothing for an unexpected response", () => {
    expect(normalizeLodgifyCalendar(null)).toEqual([]);
    expect(normalizeLodgifyCalendar({ message: "error" })).toEqual([]);
  });
});
