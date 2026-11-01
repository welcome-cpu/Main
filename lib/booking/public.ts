import "server-only";
import { checkAvailability, loadOccupancy } from "@/lib/booking/availability";
import {
  mergeRanges,
  type DateRange,
  type StayRequest,
  type UnavailableCode,
} from "@/lib/booking/availability-rules";
import { addDays, todayInZone, zonedTimeToUtc } from "@/lib/dates";
import { db } from "@/lib/db/client";

// Everything here is shown to the public. It must never include guest
// names, booking references, channels or anything that identifies who is
// staying — only whether nights are free.

export type PublicProperty = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  timezone: string;
  maxGuests: number;
  maxPets: number;
  turnoverNights: number;
  defaultMinNights: number;
  defaultMaxNights: number;
  checkInTime: string;
  checkOutTime: string;
  advanceNoticeHours: number;
  bookingWindowDays: number;
};

export type PublicCalendar = {
  property: Omit<PublicProperty, "id">;
  today: string;
  /** Earliest check-in allowed by the advance-notice rule. */
  firstCheckIn: string;
  /** Latest check-in allowed by the booking window. */
  lastCheckIn: string;
  /** Unavailable nights as merged half-open ranges [start, end). */
  unavailable: DateRange[];
  /**
   * Minimum nights for stays arriving on a date, where it isn't the
   * property's usual minimum (rate rules, Lodgify's per-date minimums). The
   * same rule the server applies (loadStayRules), so the calendar never
   * offers a stay the server would refuse for being too short.
   */
  minNightsByArrival: Record<string, number>;
  /**
   * The price of each night in the window, in pence, by the same rules as a
   * quote (rate rules, then nightly rates, then the base price unless the
   * property needs imported rates). Nights with no price are left out.
   */
  nightlyPence: Record<string, number>;
  /**
   * When the least recently synced external calendar last synced, so guests
   * (and we) can see how fresh the imported availability is. Null if none.
   */
  calendarsSyncedAt: string | null;
};

export type PublicCheck = {
  available: boolean;
  nights: number;
  reasons: { code: UnavailableCode; message: string }[];
};

export async function getPublicProperty(slug: string): Promise<PublicProperty | null> {
  if (!/^[a-z0-9-]{1,60}$/.test(slug)) return null;
  const [row] = await db()<PublicProperty[]>`
    SELECT id, slug, name, is_active, timezone, max_guests, max_pets, turnover_nights,
           default_min_nights, default_max_nights,
           to_char(check_in_time, 'HH24:MI') AS check_in_time,
           to_char(check_out_time, 'HH24:MI') AS check_out_time,
           advance_notice_hours, booking_window_days
    FROM properties WHERE slug = ${slug}
  `;
  return row ?? null;
}

export async function getPublicCalendar(
  property: PublicProperty,
  window: DateRange,
  now: Date = new Date()
): Promise<PublicCalendar> {
  const sql = db();
  const [occupancy, [sync], minNights, prices] = await Promise.all([
    loadOccupancy(sql, property.id, window),
    sql<{ syncedAt: Date | null }[]>`
      SELECT min(last_success_at) AS synced_at FROM calendar_feeds
      WHERE property_id = ${property.id} AND is_active
    `,
    sql<{ date: string; minNights: number }[]>`
      SELECT d::date::text AS date, m.min_nights
      FROM properties p
      CROSS JOIN generate_series(${window.start}::date, ${window.end}::date - 1, interval '1 day') d
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          (SELECT r.min_nights FROM rate_rules r
            WHERE r.property_id = p.id AND r.is_active AND r.min_nights IS NOT NULL AND r.nights @> d::date
            ORDER BY r.priority DESC, r.created_at DESC LIMIT 1),
          (SELECT n.min_nights FROM nightly_rates n
            WHERE n.property_id = p.id AND n.night = d::date AND (n.source = 'ADMIN' OR p.rate_source = 'LODGIFY')),
          p.default_min_nights
        ) AS min_nights
      ) m
      WHERE p.id = ${property.id} AND m.min_nights <> p.default_min_nights
    `,
    sql<{ date: string; pricePence: number }[]>`
      SELECT d::date::text AS date, x.price_pence
      FROM properties p
      CROSS JOIN generate_series(${window.start}::date, ${window.end}::date - 1, interval '1 day') d
      CROSS JOIN LATERAL (
        SELECT COALESCE(
          (SELECT r.price_pence FROM rate_rules r
            WHERE r.property_id = p.id AND r.is_active AND r.price_pence IS NOT NULL AND r.nights @> d::date
            ORDER BY r.priority DESC, r.created_at DESC LIMIT 1),
          (SELECT n.price_pence FROM nightly_rates n
            WHERE n.property_id = p.id AND n.night = d::date AND (n.source = 'ADMIN' OR p.rate_source = 'LODGIFY')),
          CASE WHEN p.rate_source = 'LODGIFY' THEN NULL ELSE p.base_nightly_pence END
        ) AS price_pence
      ) x
      WHERE p.id = ${property.id} AND x.price_pence IS NOT NULL
    `,
  ]);

  const today = todayInZone(property.timezone, now);
  return {
    property: withoutId(property),
    today,
    firstCheckIn: firstCheckInDate(property, today, now),
    lastCheckIn: addDays(today, property.bookingWindowDays),
    unavailable: mergeRanges(occupancy, window),
    minNightsByArrival: Object.fromEntries(minNights.map((m) => [m.date, m.minNights])),
    nightlyPence: Object.fromEntries(prices.map((p) => [p.date, p.pricePence])),
    calendarsSyncedAt: sync?.syncedAt ? new Date(sync.syncedAt).toISOString() : null,
  };
}

/** The first date whose check-in time is far enough away for the notice period. */
function firstCheckInDate(property: PublicProperty, today: string, now: Date) {
  let date = today;
  for (let i = 0; i < 60; i++) {
    const arrival = zonedTimeToUtc(date, property.checkInTime, property.timezone);
    if (arrival.getTime() - now.getTime() >= property.advanceNoticeHours * 3_600_000) return date;
    date = addDays(date, 1);
  }
  return date;
}

export async function checkPublicStay(property: PublicProperty, request: StayRequest): Promise<PublicCheck> {
  const result = await checkAvailability(db(), property.id, request);
  if (!result) return { available: false, nights: 0, reasons: [] };
  // Strip conflict details: the public only learns that dates are taken.
  return {
    available: result.available,
    nights: result.nights,
    reasons: result.reasons.map(({ code, message }) => ({ code, message })),
  };
}

export async function searchPublicProperties(request: StayRequest) {
  const properties = await db()<{ slug: string }[]>`SELECT slug FROM properties ORDER BY name`;
  return Promise.all(
    properties.map(async ({ slug }) => {
      const property = (await getPublicProperty(slug))!;
      const check = await checkPublicStay(property, request);
      return { slug, name: property.name, ...check };
    })
  );
}

function withoutId(property: PublicProperty): Omit<PublicProperty, "id"> {
  const copy: Partial<PublicProperty> = { ...property };
  delete copy.id;
  return copy as Omit<PublicProperty, "id">;
}
