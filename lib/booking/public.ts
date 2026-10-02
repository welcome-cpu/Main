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
  const [occupancy, [sync]] = await Promise.all([
    loadOccupancy(sql, property.id, window),
    sql<{ syncedAt: Date | null }[]>`
      SELECT min(last_success_at) AS synced_at FROM calendar_feeds
      WHERE property_id = ${property.id} AND is_active
    `,
  ]);

  const today = todayInZone(property.timezone, now);
  return {
    property: withoutId(property),
    today,
    firstCheckIn: firstCheckInDate(property, today, now),
    lastCheckIn: addDays(today, property.bookingWindowDays),
    unavailable: mergeRanges(occupancy, window),
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
