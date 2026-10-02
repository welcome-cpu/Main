import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isValidDate, todayInZone, zonedTimeToUtc } from "@/lib/dates";

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isValidDate("2028-02-29")).toBe(true);
    expect(isValidDate("2027-02-29")).toBe(false);
    expect(isValidDate("2027-13-01")).toBe(false);
    expect(isValidDate("27-01-01")).toBe(false);
  });

  it("adds days across month, year and DST boundaries", () => {
    expect(addDays("2027-01-31", 1)).toBe("2027-02-01");
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(addDays("2027-03-28", 1)).toBe("2027-03-29"); // clocks go forward
    expect(addDays("2027-10-31", 1)).toBe("2027-11-01"); // clocks go back
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });

  it("counts nights across DST changes", () => {
    expect(daysBetween("2027-03-27", "2027-03-29")).toBe(2);
    expect(daysBetween("2027-10-30", "2027-11-01")).toBe(2);
  });

  it("converts London wall-clock times to UTC in winter and summer", () => {
    expect(zonedTimeToUtc("2027-01-15", "15:00", "Europe/London").toISOString()).toBe("2027-01-15T15:00:00.000Z");
    expect(zonedTimeToUtc("2027-07-15", "15:00", "Europe/London").toISOString()).toBe("2027-07-15T14:00:00.000Z");
    // The day the clocks go forward (01:00 -> 02:00): 15:00 is BST.
    expect(zonedTimeToUtc("2027-03-28", "15:00", "Europe/London").toISOString()).toBe("2027-03-28T14:00:00.000Z");
  });

  it("gives today's date in the property's timezone", () => {
    expect(todayInZone("Europe/London", new Date("2027-06-30T23:30:00Z"))).toBe("2027-07-01");
    expect(todayInZone("Europe/London", new Date("2027-12-31T23:30:00Z"))).toBe("2027-12-31");
  });
});
