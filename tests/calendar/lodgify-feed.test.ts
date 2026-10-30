import { describe, expect, it } from "vitest";
import { lodgifyAvailabilityToEvents, LodgifyFeedError } from "@/lib/calendar/lodgify-feed";

// Shaped like real /v2/availability responses.
const entry = (periods: unknown[]) => [{ user_id: 1, property_id: 646178, room_type_id: 713160, periods }];
const period = (start: string, end: string, available: number, extra: object = {}) => ({
  start,
  end,
  available,
  closed_period: null,
  bookings: [],
  channel_calendars: [],
  ...extra,
});

describe("Lodgify availability as calendar events", () => {
  it("turns a booking into a stay ending the day after its last night", () => {
    const events = lodgifyAvailabilityToEvents(
      entry([
        period("2026-11-01", "2026-11-01", 1),
        period("2026-11-02", "2026-11-05", 0, { bookings: [{ id: 23421330, status: null }] }),
        period("2026-11-06", "2026-11-30", 1),
      ])
    );
    expect(events).toEqual([
      { uid: "lodgify-booking-23421330", startDate: "2026-11-02", endDate: "2026-11-06", summary: "Lodgify booking 23421330", cancelled: false },
    ]);
  });

  it("keeps back-to-back bookings separate", () => {
    const events = lodgifyAvailabilityToEvents(
      entry([
        period("2026-11-02", "2026-11-04", 0, { bookings: [{ id: 1 }] }),
        period("2026-11-05", "2026-11-06", 0, { bookings: [{ id: 2 }] }),
      ])
    );
    expect(events.map((e) => [e.uid, e.startDate, e.endDate])).toEqual([
      ["lodgify-booking-1", "2026-11-02", "2026-11-05"],
      ["lodgify-booking-2", "2026-11-05", "2026-11-07"],
    ]);
  });

  it("includes dates closed in Lodgify without a booking", () => {
    const [closed, named] = lodgifyAvailabilityToEvents(
      entry([
        period("2026-10-30", "2026-12-31", 0),
        period("2027-02-01", "2027-02-03", 0, { closed_period: { name: "Maintenance" } }),
      ])
    );
    expect(closed).toMatchObject({ uid: "lodgify-closed-2026-10-30", endDate: "2027-01-01", summary: "Not available in Lodgify" });
    expect(named.summary).toBe("Closed in Lodgify: Maintenance");
  });

  it("refuses a response it doesn't understand rather than clearing the calendar", () => {
    expect(() => lodgifyAvailabilityToEvents({ message: "error" })).toThrow(LodgifyFeedError);
    expect(() => lodgifyAvailabilityToEvents([{ periods: null }])).toThrow(LodgifyFeedError);
  });

  it("skips malformed periods", () => {
    expect(lodgifyAvailabilityToEvents(entry([period("not a date", "2026-11-02", 0), period("2026-11-05", "2026-11-02", 0)]))).toEqual([]);
  });
});
