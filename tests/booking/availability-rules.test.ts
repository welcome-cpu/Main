import { describe, expect, it } from "vitest";
import {
  evaluateStay,
  overlaps,
  type Occupancy,
  type StayRequest,
  type StayRules,
} from "@/lib/booking/availability-rules";

// Mid-January: GMT, so London local time equals UTC.
const NOW = new Date("2027-01-10T12:00:00Z");

const rules: StayRules = {
  isActive: true,
  timezone: "Europe/London",
  checkInTime: "15:00",
  maxGuests: 2,
  maxPets: 2,
  turnoverNights: 0,
  minNights: 2,
  maxNights: 28,
  advanceNoticeHours: 24,
  bookingWindowDays: 365,
};

const stay = (checkIn: string, checkOut: string, extra: Partial<StayRequest> = {}): StayRequest => ({
  checkIn,
  checkOut,
  adults: 2,
  children: 0,
  infants: 0,
  pets: 0,
  ...extra,
});

const occ = (kind: Occupancy["kind"], start: string, end: string, source: string | null = null): Occupancy => ({
  kind,
  source,
  ref: `${kind}-${start}`,
  start,
  end,
});

const check = (
  request: StayRequest,
  occupancy: Occupancy[] = [],
  overrides: Partial<StayRules> = {},
  now = NOW
) => evaluateStay(request, { ...rules, ...overrides }, occupancy, { now });

const codes = (r: ReturnType<typeof check>) => r.reasons.map((x) => x.code);

describe("overlaps (half-open date ranges)", () => {
  const a = { start: "2027-08-05", end: "2027-08-10" };
  it("detects a partial overlap", () => expect(overlaps(a, { start: "2027-08-09", end: "2027-08-12" })).toBe(true));
  it("detects containment", () => expect(overlaps(a, { start: "2027-08-06", end: "2027-08-07" })).toBe(true));
  it("detects enclosure", () => expect(overlaps(a, { start: "2027-08-01", end: "2027-08-20" })).toBe(true));
  it("treats touching ranges as not overlapping", () => {
    expect(overlaps(a, { start: "2027-08-10", end: "2027-08-12" })).toBe(false);
    expect(overlaps(a, { start: "2027-08-01", end: "2027-08-05" })).toBe(false);
  });
});

describe("evaluateStay", () => {
  it("allows a normal available stay", () => {
    const r = check(stay("2027-03-01", "2027-03-04"));
    expect(r).toMatchObject({ available: true, reasons: [], nights: 3 });
  });

  it("rejects a stay that overlaps a confirmed reservation", () => {
    const r = check(stay("2027-03-01", "2027-03-04"), [occ("RESERVATION", "2027-03-03", "2027-03-06", "DIRECT")]);
    expect(r.available).toBe(false);
    expect(codes(r)).toEqual(["DATES_TAKEN"]);
    expect(r.conflicts).toHaveLength(1);
  });

  it("rejects a stay that encloses an existing reservation", () => {
    const r = check(stay("2027-03-01", "2027-03-10"), [occ("RESERVATION", "2027-03-04", "2027-03-06")]);
    expect(codes(r)).toEqual(["DATES_TAKEN"]);
  });

  it("allows back-to-back stays: checking in on another guest's checkout day", () => {
    expect(check(stay("2027-03-06", "2027-03-08"), [occ("RESERVATION", "2027-03-03", "2027-03-06")]).available).toBe(true);
  });

  it("allows back-to-back stays: checking out on another guest's check-in day", () => {
    expect(check(stay("2027-03-01", "2027-03-03"), [occ("RESERVATION", "2027-03-03", "2027-03-06")]).available).toBe(true);
  });

  describe("with a turnover night (Murray Cottage)", () => {
    // The stored occupancy end already includes the existing stay's turnover.
    const existing = [occ("RESERVATION", "2027-03-03", "2027-03-07")]; // stay 3–6, cleaning night of the 6th

    it("rejects check-in on the existing guest's checkout day", () => {
      expect(codes(check(stay("2027-03-06", "2027-03-09"), existing, { turnoverNights: 1 }))).toEqual(["DATES_TAKEN"]);
    });

    it("allows check-in the day after", () => {
      expect(check(stay("2027-03-07", "2027-03-10"), existing, { turnoverNights: 1 }).available).toBe(true);
    });

    it("rejects checking out on the next guest's check-in day (needs its own cleaning night)", () => {
      expect(codes(check(stay("2027-02-28", "2027-03-03"), existing, { turnoverNights: 1 }))).toEqual(["DATES_TAKEN"]);
    });

    it("allows checking out the day before the next guest arrives", () => {
      expect(check(stay("2027-02-27", "2027-03-02"), existing, { turnoverNights: 1 }).available).toBe(true);
    });
  });

  it("is blocked by an active checkout hold", () => {
    expect(codes(check(stay("2027-03-01", "2027-03-04"), [occ("HOLD", "2027-03-02", "2027-03-05", "DIRECT")]))).toEqual([
      "DATES_TAKEN",
    ]);
  });

  it("is blocked by a manual owner block", () => {
    expect(codes(check(stay("2027-03-01", "2027-03-04"), [occ("MANUAL_BLOCK", "2027-03-03", "2027-03-04")]))).toEqual([
      "DATES_TAKEN",
    ]);
  });

  it("is blocked by an imported Airbnb booking", () => {
    const r = check(stay("2027-03-01", "2027-03-04"), [occ("EXTERNAL", "2027-03-02", "2027-03-03", "AIRBNB")]);
    expect(r.conflicts[0]).toMatchObject({ kind: "EXTERNAL", source: "AIRBNB" });
  });

  it("is blocked by an imported Booking.com booking", () => {
    const r = check(stay("2027-03-01", "2027-03-04"), [occ("EXTERNAL", "2027-03-01", "2027-03-02", "BOOKING_COM")]);
    expect(r.conflicts[0]).toMatchObject({ kind: "EXTERNAL", source: "BOOKING_COM" });
  });

  it("reports every clash", () => {
    const r = check(stay("2027-03-01", "2027-03-10"), [
      occ("EXTERNAL", "2027-03-02", "2027-03-03", "AIRBNB"),
      occ("MANUAL_BLOCK", "2027-03-05", "2027-03-06"),
      occ("RESERVATION", "2027-03-12", "2027-03-14"),
    ]);
    expect(r.conflicts.map((c) => c.kind)).toEqual(["EXTERNAL", "MANUAL_BLOCK"]);
  });

  describe("dates", () => {
    it("rejects an impossible date", () => expect(codes(check(stay("2027-02-30", "2027-03-02")))).toEqual(["INVALID_DATES"]));
    it("rejects check-out on check-in day", () => expect(codes(check(stay("2027-03-01", "2027-03-01")))).toEqual(["INVALID_DATES"]));
    it("rejects check-out before check-in", () => expect(codes(check(stay("2027-03-05", "2027-03-01")))).toEqual(["INVALID_DATES"]));
    it("rejects a past check-in", () => expect(codes(check(stay("2027-01-05", "2027-01-08")))).toContain("IN_THE_PAST"));
    it("counts nights across the clocks going forward", () => {
      expect(check(stay("2027-03-27", "2027-03-30")).nights).toBe(3);
    });
  });

  describe("stay length", () => {
    it("enforces the minimum stay", () => expect(codes(check(stay("2027-03-01", "2027-03-02")))).toEqual(["MIN_STAY"]));
    it("allows exactly the minimum", () => expect(check(stay("2027-03-01", "2027-03-03")).available).toBe(true));
    it("enforces the maximum stay", () => {
      expect(codes(check(stay("2027-03-01", "2027-03-08"), [], { maxNights: 6 }))).toEqual(["MAX_STAY"]);
    });
  });

  describe("guests and pets", () => {
    it("rejects too many guests", () => {
      expect(codes(check(stay("2027-03-01", "2027-03-04", { adults: 2, children: 1 })))).toEqual(["TOO_MANY_GUESTS"]);
    });
    it("doesn't count infants towards the guest limit", () => {
      expect(check(stay("2027-03-01", "2027-03-04", { adults: 2, infants: 1 })).available).toBe(true);
    });
    it("needs an adult", () => {
      expect(codes(check(stay("2027-03-01", "2027-03-04", { adults: 0, children: 1 })))).toEqual(["NO_ADULTS"]);
    });
    it("rejects too many pets", () => {
      expect(codes(check(stay("2027-03-01", "2027-03-04", { pets: 3 })))).toEqual(["TOO_MANY_PETS"]);
    });
    it("rejects pets where none are allowed", () => {
      const r = check(stay("2027-03-01", "2027-03-04", { pets: 1 }), [], { maxPets: 0 });
      expect(r.reasons[0].message).toMatch(/aren't allowed/);
    });
  });

  describe("advance notice and booking window (property-local time)", () => {
    it("allows check-in 27 hours away with 24 hours' notice", () => {
      // 15:00 GMT on the 11th is 27 hours after 12:00 UTC on the 10th.
      expect(check(stay("2027-01-11", "2027-01-13")).available).toBe(true);
    });
    it("rejects check-in with less than the notice period", () => {
      expect(codes(check(stay("2027-01-11", "2027-01-13"), [], { advanceNoticeHours: 30 }))).toEqual(["TOO_SOON"]);
    });
    it("uses British Summer Time for summer check-ins", () => {
      // 15:00 BST on 11 June = 14:00 UTC. From 13:30 UTC on the 10th that's 24.5h: allowed...
      expect(check(stay("2027-06-11", "2027-06-13"), [], {}, new Date("2027-06-10T13:30:00Z")).available).toBe(true);
      // ...but from 14:30 UTC it's 23.5h: too soon. (Treating 15:00 as UTC would wrongly allow it.)
      expect(codes(check(stay("2027-06-11", "2027-06-13"), [], {}, new Date("2027-06-10T14:30:00Z")))).toEqual(["TOO_SOON"]);
    });
    it("uses the property's date, not the server's, for 'today'", () => {
      // 23:30 UTC on 30 June is already 1 July in London, so a 30 June check-in is in the past.
      const r = check(stay("2027-06-30", "2027-07-02"), [], { advanceNoticeHours: 0 }, new Date("2027-06-30T23:30:00Z"));
      expect(codes(r)).toContain("IN_THE_PAST");
    });
    it("rejects bookings beyond the booking window", () => {
      expect(codes(check(stay("2028-02-01", "2028-02-03")))).toEqual(["TOO_FAR_AHEAD"]);
    });
  });

  it("rejects a property that isn't bookable", () => {
    expect(codes(check(stay("2027-03-01", "2027-03-04"), [], { isActive: false }))).toEqual(["PROPERTY_NOT_BOOKABLE"]);
  });

  it("lets admin bookings bypass the bookable, notice and window rules, but never clashes", () => {
    const opts = { now: NOW, ignoreBookingRules: true };
    const inactive = { ...rules, isActive: false };
    expect(evaluateStay(stay("2027-01-10", "2027-01-12"), inactive, [], opts).available).toBe(true);
    expect(
      evaluateStay(stay("2027-01-10", "2027-01-12"), inactive, [occ("EXTERNAL", "2027-01-11", "2027-01-12")], opts).available
    ).toBe(false);
  });
});
