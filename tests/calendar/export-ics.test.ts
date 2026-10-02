import { describe, expect, it } from "vitest";
import { buildExportIcs } from "@/lib/calendar/export-ics";
import { parseIcs } from "@/lib/calendar/ics-parse";

describe("buildExportIcs", () => {
  const ics = buildExportIcs(
    "Muckle View, Gamrie Chalets direct",
    [
      { uid: "reservation-1@gamriechalets.co.uk", start: "2027-08-05", end: "2027-08-10", summary: "Booked (Gamrie Chalets direct)" },
      { uid: "block-2@gamriechalets.co.uk", start: "2027-08-20", end: "2027-08-22", summary: "Blocked" },
    ],
    new Date("2027-01-01T12:00:00Z")
  );

  it("is a valid calendar with CRLF line endings and all-day dates", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART;VALUE=DATE:20270805\r\nDTEND;VALUE=DATE:20270810");
    expect(ics).toContain("X-WR-CALNAME:Muckle View\\, Gamrie Chalets direct");
    expect(ics.split("\r\n").every((line) => Buffer.byteLength(line) <= 75)).toBe(true);
  });

  it("round-trips through our own importer (what other channels will read)", () => {
    expect(parseIcs(ics, "Europe/London").events).toEqual([
      { uid: "reservation-1@gamriechalets.co.uk", startDate: "2027-08-05", endDate: "2027-08-10", summary: "Booked (Gamrie Chalets direct)", cancelled: false },
      { uid: "block-2@gamriechalets.co.uk", startDate: "2027-08-20", endDate: "2027-08-22", summary: "Blocked", cancelled: false },
    ]);
  });
});
