import { describe, expect, it } from "vitest";
import { IcsParseError, parseIcs } from "@/lib/calendar/ics-parse";

const TZ = "Europe/London";

function calendar(...events: string[]) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//EN", ...events, "END:VCALENDAR"].join("\r\n");
}
function vevent(lines: string[]) {
  return ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
}

describe("parseIcs", () => {
  it("reads all-day events in the Lodgify export format", () => {
    const text = calendar(
      vevent([
        "DTEND;VALUE=DATE:20270810",
        "DTSTAMP:20261002T140034Z",
        "DTSTART;VALUE=DATE:20270805",
        "SEQUENCE:0",
        "SUMMARY:J*** S****",
        "UID:aaa-111",
      ])
    );
    const { events, warnings } = parseIcs(text, TZ);
    expect(warnings).toEqual([]);
    expect(events).toEqual([
      { uid: "aaa-111", startDate: "2027-08-05", endDate: "2027-08-10", summary: "J*** S****", cancelled: false },
    ]);
  });

  it("reads Airbnb-style events (summary with escaped text)", () => {
    const text = calendar(
      vevent([
        "DTSTART;VALUE=DATE:20270101",
        "DTEND;VALUE=DATE:20270104",
        "UID:1418fb94e984-abc@airbnb.com",
        "SUMMARY:Airbnb (Not available)",
        "DESCRIPTION:Reservation URL: https://www.airbnb.com/hosting/reservations/details/HM123\\nPhone: 1234",
      ])
    );
    expect(parseIcs(text, TZ).events[0]).toMatchObject({
      startDate: "2027-01-01",
      endDate: "2027-01-04",
      summary: "Airbnb (Not available)",
    });
  });

  it("joins folded lines", () => {
    const text = calendar(
      vevent(["UID:fold-1", "DTSTART;VALUE=DATE:20270301", "DTEND;VALUE=DATE:20270303", "SUMMARY:A very long", "  summary line"])
    );
    expect(parseIcs(text, TZ).events[0].summary).toBe("A very long summary line");
  });

  it("converts UTC date-times to the property's local date", () => {
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST).
    const text = calendar(vevent(["UID:utc-1", "DTSTART:20270630T233000Z", "DTEND:20270703T100000Z"]));
    expect(parseIcs(text, TZ).events[0]).toMatchObject({ startDate: "2027-07-01", endDate: "2027-07-03" });
  });

  it("uses the written date for local and TZID date-times", () => {
    const text = calendar(
      vevent(["UID:tz-1", "DTSTART;TZID=Europe/London:20270805T150000", "DTEND;TZID=Europe/London:20270810T110000"])
    );
    expect(parseIcs(text, TZ).events[0]).toMatchObject({ startDate: "2027-08-05", endDate: "2027-08-10" });
  });

  it("gives an all-day event with no end a single night", () => {
    const text = calendar(vevent(["UID:one-1", "DTSTART;VALUE=DATE:20270505"]));
    expect(parseIcs(text, TZ).events[0]).toMatchObject({ startDate: "2027-05-05", endDate: "2027-05-06" });
  });

  it("supports DURATION instead of DTEND", () => {
    const text = calendar(vevent(["UID:dur-1", "DTSTART;VALUE=DATE:20270505", "DURATION:P3D"]));
    expect(parseIcs(text, TZ).events[0]).toMatchObject({ endDate: "2027-05-08" });
  });

  it("flags cancelled events", () => {
    const text = calendar(
      vevent(["UID:c-1", "DTSTART;VALUE=DATE:20270505", "DTEND;VALUE=DATE:20270507", "STATUS:CANCELLED"])
    );
    expect(parseIcs(text, TZ).events[0].cancelled).toBe(true);
  });

  it("keeps the last copy of a duplicated UID and warns", () => {
    const text = calendar(
      vevent(["UID:dup", "DTSTART;VALUE=DATE:20270505", "DTEND;VALUE=DATE:20270507"]),
      vevent(["UID:dup", "DTSTART;VALUE=DATE:20270505", "DTEND;VALUE=DATE:20270508"])
    );
    const { events, warnings } = parseIcs(text, TZ);
    expect(events).toHaveLength(1);
    expect(events[0].endDate).toBe("2027-05-08");
    expect(warnings).toHaveLength(1);
  });

  it("skips events it can't safely understand, without failing the feed", () => {
    const text = calendar(
      vevent(["DTSTART;VALUE=DATE:20270505", "DTEND;VALUE=DATE:20270507"]),
      vevent(["UID:rr", "DTSTART;VALUE=DATE:20270505", "RRULE:FREQ=WEEKLY"]),
      vevent(["UID:bad", "DTSTART;VALUE=DATE:2027-05-05"]),
      vevent(["UID:back", "DTSTART;VALUE=DATE:20270510", "DTEND;VALUE=DATE:20270505"]),
      vevent(["UID:good", "DTSTART;VALUE=DATE:20270601", "DTEND;VALUE=DATE:20270603"])
    );
    const { events, warnings } = parseIcs(text, TZ);
    expect(events.map((e) => e.uid)).toEqual(["good"]);
    expect(warnings).toHaveLength(4);
  });

  it("ignores properties inside nested components like VALARM", () => {
    const text = calendar(
      vevent([
        "UID:alarm-1",
        "DTSTART;VALUE=DATE:20270505",
        "DTEND;VALUE=DATE:20270507",
        "BEGIN:VALARM",
        "UID:not-this-one",
        "END:VALARM",
      ])
    );
    expect(parseIcs(text, TZ).events[0].uid).toBe("alarm-1");
  });

  it("rejects something that isn't a calendar (e.g. an HTML error page)", () => {
    expect(() => parseIcs("<html><body>301 Moved Permanently</body></html>", TZ)).toThrow(IcsParseError);
  });

  it("rejects a truncated calendar", () => {
    expect(() => parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:x", TZ)).toThrow(IcsParseError);
  });

  it("accepts an empty but complete calendar", () => {
    expect(parseIcs(calendar(), TZ).events).toEqual([]);
  });
});
