import "server-only";
import {
  blockedRange,
  evaluateStay,
  type AvailabilityResult,
  type EvaluateOptions,
  type Occupancy,
  type StayRequest,
  type StayRules,
} from "@/lib/booking/availability-rules";
import { isValidDate } from "@/lib/dates";
import type { Sql, Tx } from "@/lib/db/client";

/**
 * The single source of truth for "can this stay be booked?". Combines:
 *   - confirmed reservations and unexpired checkout holds (this system)
 *   - imported bookings from active external calendars
 *   - active manual owner blocks
 * plus the property's stay rules. Never trust availability from the browser:
 * anything that creates a booking must call this again on the server, inside
 * a transaction holding lockPropertyAvailability().
 */
export async function checkAvailability(
  sql: Sql | Tx,
  propertyId: string,
  request: StayRequest,
  options: EvaluateOptions & { excludeReservationId?: string } = {}
): Promise<AvailabilityResult | null> {
  const rules = await loadStayRules(sql, propertyId, request.checkIn);
  if (!rules) return null;

  // Bad dates are reported by evaluateStay; don't send them to the database.
  const datesOk =
    isValidDate(request.checkIn) && isValidDate(request.checkOut) && request.checkOut > request.checkIn;
  const occupancy = datesOk
    ? await loadOccupancy(
        sql,
        propertyId,
        blockedRange(request.checkIn, request.checkOut, rules.turnoverNights),
        options.excludeReservationId ?? null
      )
    : [];

  return evaluateStay(request, rules, occupancy, options);
}

/**
 * The property's rules for a stay arriving on `checkIn`. Minimum/maximum
 * stay come from, in order: an active rate rule covering the arrival night
 * (highest priority, then newest), that night's stored rate, the property
 * default.
 */
export async function loadStayRules(
  sql: Sql | Tx,
  propertyId: string,
  checkIn: string
): Promise<StayRules | null> {
  const arrival = isValidDate(checkIn) ? checkIn : null;
  const [row] = await sql<(StayRules & { ruleMin: number | null; ruleMax: number | null; rateMin: number | null; rateMax: number | null; defaultMinNights: number; defaultMaxNights: number })[]>`
    SELECT
      p.is_active, p.timezone, to_char(p.check_in_time, 'HH24:MI') AS check_in_time,
      p.max_guests, p.max_pets, p.turnover_nights, p.advance_notice_hours,
      p.booking_window_days, p.default_min_nights, p.default_max_nights,
      (SELECT r.min_nights FROM rate_rules r
        WHERE r.property_id = p.id AND r.is_active AND r.min_nights IS NOT NULL
          AND r.nights @> ${arrival}::date
        ORDER BY r.priority DESC, r.created_at DESC LIMIT 1) AS rule_min,
      (SELECT r.max_nights FROM rate_rules r
        WHERE r.property_id = p.id AND r.is_active AND r.max_nights IS NOT NULL
          AND r.nights @> ${arrival}::date
        ORDER BY r.priority DESC, r.created_at DESC LIMIT 1) AS rule_max,
      n.min_nights AS rate_min,
      n.max_nights AS rate_max
    FROM properties p
    LEFT JOIN nightly_rates n
      ON n.property_id = p.id AND n.night = ${arrival}::date
     AND (n.source = 'ADMIN' OR p.rate_source = 'LODGIFY')
    WHERE p.id = ${propertyId}
  `;
  if (!row) return null;

  return {
    isActive: row.isActive,
    timezone: row.timezone,
    checkInTime: row.checkInTime,
    maxGuests: row.maxGuests,
    maxPets: row.maxPets,
    turnoverNights: row.turnoverNights,
    advanceNoticeHours: row.advanceNoticeHours,
    bookingWindowDays: row.bookingWindowDays,
    minNights: row.ruleMin ?? row.rateMin ?? row.defaultMinNights,
    maxNights: row.ruleMax ?? row.rateMax ?? row.defaultMaxNights,
  };
}

/** Everything occupying nights that overlap `range`, each with its own turnover applied. */
export async function loadOccupancy(
  sql: Sql | Tx,
  propertyId: string,
  range: { start: string; end: string },
  excludeReservationId: string | null = null
): Promise<Occupancy[]> {
  return sql<Occupancy[]>`
    WITH wanted AS (SELECT daterange(${range.start}::date, ${range.end}::date, '[)') AS r)
    SELECT
      CASE WHEN res.status = 'HOLD' THEN 'HOLD' ELSE 'RESERVATION' END AS kind,
      res.source, res.reference AS ref,
      lower(res.blocked)::text AS start, upper(res.blocked)::text AS "end"
    FROM reservations res, wanted
    WHERE res.property_id = ${propertyId}
      AND (res.status = 'CONFIRMED' OR (res.status = 'HOLD' AND res.hold_expires_at > now()))
      AND res.blocked && wanted.r
      AND res.id IS DISTINCT FROM ${excludeReservationId}::uuid

    UNION ALL
    SELECT 'EXTERNAL', f.source, e.id::text,
      e.start_date::text,
      (e.end_date + CASE WHEN f.apply_turnover THEN p.turnover_nights ELSE 0 END)::text
    FROM external_events e
    JOIN calendar_feeds f ON f.id = e.feed_id AND f.is_active
    JOIN properties p ON p.id = e.property_id, wanted
    WHERE e.property_id = ${propertyId}
      AND e.status = 'ACTIVE'
      AND daterange(e.start_date, e.end_date + CASE WHEN f.apply_turnover THEN p.turnover_nights ELSE 0 END, '[)') && wanted.r

    UNION ALL
    SELECT 'MANUAL_BLOCK', NULL, b.id::text, b.start_date::text, b.end_date::text
    FROM manual_blocks b, wanted
    WHERE b.property_id = ${propertyId} AND b.is_active AND b.nights && wanted.r

    ORDER BY start
  `;
}
