// The availability decision itself, as pure logic over already-loaded data.
// The database layer (availability.ts) gathers the inputs; everything that
// decides "can this stay be booked?" lives here so it can be tested exhaustively.

import { addDays, daysBetween, isValidDate, todayInZone, zonedTimeToUtc } from "@/lib/dates";

/** A half-open date range [start, end): the nights start .. end-1. */
export type DateRange = { start: string; end: string };

export function overlaps(a: DateRange, b: DateRange) {
  return a.start < b.end && b.start < a.end;
}

/**
 * Union of ranges, merging overlapping and touching ones, clipped to
 * `window`. Used for the public calendar: merging means guests see only
 * "booked" stretches, not where one booking ends and another begins.
 */
export function mergeRanges(ranges: DateRange[], window: DateRange): DateRange[] {
  const clipped = ranges
    .map((r) => ({
      start: r.start > window.start ? r.start : window.start,
      end: r.end < window.end ? r.end : window.end,
    }))
    .filter((r) => r.start < r.end)
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged: DateRange[] = [];
  for (const r of clipped) {
    const last = merged.at(-1);
    if (last && r.start <= last.end) {
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

export type OccupancyKind ="RESERVATION" | "HOLD" | "EXTERNAL" | "MANUAL_BLOCK";

/**
 * Something already taking nights out of inventory. `end` already includes
 * that item's own turnover nights (e.g. Murray Cottage's cleaning night).
 */
export type Occupancy = DateRange & {
  kind: OccupancyKind;
  /** Booking source/channel, e.g. DIRECT, AIRBNB, LODGIFY. */
  source: string | null;
  /** Internal id/reference: for admin views only, never for the public. */
  ref: string;
};

export type StayRequest = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
};

export type StayRules = {
  isActive: boolean;
  timezone: string;
  checkInTime: string; // HH:MM
  maxGuests: number;
  maxPets: number;
  turnoverNights: number;
  minNights: number;
  maxNights: number;
  advanceNoticeHours: number;
  bookingWindowDays: number;
};

export type UnavailableCode =
  | "INVALID_DATES"
  | "PROPERTY_NOT_BOOKABLE"
  | "IN_THE_PAST"
  | "TOO_SOON"
  | "TOO_FAR_AHEAD"
  | "MIN_STAY"
  | "MAX_STAY"
  | "NO_ADULTS"
  | "TOO_MANY_GUESTS"
  | "TOO_MANY_PETS"
  | "DATES_TAKEN";

export type Reason = { code: UnavailableCode; message: string };

export type AvailabilityResult = {
  available: boolean;
  reasons: Reason[];
  /** What the requested stay clashes with. Admin-only detail. */
  conflicts: Occupancy[];
  nights: number;
};

export type EvaluateOptions = {
  now?: Date;
  /** Admin bookings may bypass "not bookable", notice and window rules. */
  ignoreBookingRules?: boolean;
};

/**
 * Hotel-style boundaries: a stay occupies [checkIn, checkOut). With turnover
 * nights, it also blocks the nights after checkout, so the next guest can
 * arrive no earlier than checkOut + turnoverNights.
 */
export function blockedRange(checkIn: string, checkOut: string, turnoverNights: number): DateRange {
  return { start: checkIn, end: addDays(checkOut, turnoverNights) };
}

export function evaluateStay(
  request: StayRequest,
  rules: StayRules,
  occupancy: Occupancy[],
  options: EvaluateOptions = {}
): AvailabilityResult {
  const now = options.now ?? new Date();
  const reasons: Reason[] = [];
  const fail = (code: UnavailableCode, message: string) => reasons.push({ code, message });

  if (!isValidDate(request.checkIn) || !isValidDate(request.checkOut)) {
    fail("INVALID_DATES", "Choose valid check-in and check-out dates.");
    return { available: false, reasons, conflicts: [], nights: 0 };
  }
  const nights = daysBetween(request.checkIn, request.checkOut);
  if (nights < 1) {
    fail("INVALID_DATES", "Check-out must be after check-in.");
    return { available: false, reasons, conflicts: [], nights: 0 };
  }

  if (!options.ignoreBookingRules) {
    if (!rules.isActive) fail("PROPERTY_NOT_BOOKABLE", "This property can't be booked online at the moment.");

    const today = todayInZone(rules.timezone, now);
    const arrival = zonedTimeToUtc(request.checkIn, rules.checkInTime, rules.timezone);
    if (request.checkIn < today) {
      fail("IN_THE_PAST", "Check-in can't be in the past.");
    } else if (arrival.getTime() - now.getTime() < rules.advanceNoticeHours * 3_600_000) {
      fail("TOO_SOON", `Bookings need at least ${rules.advanceNoticeHours} hours' notice before check-in.`);
    }
    if (request.checkIn > addDays(today, rules.bookingWindowDays)) {
      fail("TOO_FAR_AHEAD", `Bookings can be made up to ${rules.bookingWindowDays} days ahead.`);
    }
  }

  if (nights < rules.minNights) fail("MIN_STAY", `The minimum stay for these dates is ${rules.minNights} nights.`);
  if (nights > rules.maxNights) fail("MAX_STAY", `The maximum stay for these dates is ${rules.maxNights} nights.`);

  // Infants don't count towards the guest limit.
  if (request.adults < 1) fail("NO_ADULTS", "At least one adult is needed.");
  if (request.adults + request.children > rules.maxGuests) {
    fail("TOO_MANY_GUESTS", `This property sleeps up to ${rules.maxGuests}.`);
  }
  if (request.pets > rules.maxPets) {
    fail(
      "TOO_MANY_PETS",
      rules.maxPets === 0 ? "Pets aren't allowed at this property." : `Up to ${rules.maxPets} pets are allowed.`
    );
  }

  const wanted = blockedRange(request.checkIn, request.checkOut, rules.turnoverNights);
  const conflicts = occupancy.filter((o) => overlaps(wanted, o));
  if (conflicts.length > 0) fail("DATES_TAKEN", "Those dates aren't available.");

  return { available: reasons.length === 0, reasons, conflicts, nights };
}
