import { describe, expect, it } from "vitest";
import { planTransitions } from "@/lib/heating/plan";
import { guestStays, type UnavailableRow } from "@/lib/heating/stays";

// Murray Cottage on the dev database, Nov 2026: a guest 13-16 Nov with
// Lodgify's preparation night either side, from both Lodgify feeds.
const murray: UnavailableRow[] = [
  { source: "EXTERNAL", start: "2026-11-12", end: "2026-11-13", uid: "20873156-ical", summary: "Preparation Time" },
  { source: "EXTERNAL", start: "2026-11-12", end: "2026-11-13", uid: "lodgify-closed-2026-11-12", summary: "Not available in Lodgify" },
  { source: "EXTERNAL", start: "2026-11-13", end: "2026-11-16", uid: "b22c6041-ical", summary: "Guest Name" },
  { source: "EXTERNAL", start: "2026-11-13", end: "2026-11-16", uid: "lodgify-booking-23135057", summary: "Lodgify booking 23135057" },
  { source: "EXTERNAL", start: "2026-11-16", end: "2026-11-17", uid: "72ada7b7-ical", summary: "Preparation Time" },
  { source: "EXTERNAL", start: "2026-11-16", end: "2026-11-17", uid: "lodgify-closed-2026-11-16", summary: "Not available in Lodgify" },
  { source: "EXTERNAL", start: "2026-11-21", end: "2026-11-30", uid: "lodgify-closed-2026-11-21", summary: "Not available in Lodgify" },
];

describe("guestStays", () => {
  it("drops Lodgify's preparation nights so the guest leaves on 16 Nov", () => {
    const stays = guestStays(murray);
    expect(stays).not.toContainEqual({ start: "2026-11-12", end: "2026-11-13" });
    expect(stays).not.toContainEqual({ start: "2026-11-16", end: "2026-11-17" });
    const keys = planTransitions(stays, { timeZone: "Europe/London", checkOutTime: "11:00" }).map((t) => `${t.key} ${t.at.toISOString()}`);
    expect(keys).toEqual([
      "reset:2026-11-13 2026-11-12T18:00:00.000Z",
      "off:2026-11-16 2026-11-16T11:00:00.000Z",
      "reset:2026-11-21 2026-11-20T18:00:00.000Z",
      "off:2026-11-30 2026-11-30T11:00:00.000Z",
    ]);
  });

  it("drops short closed periods touching a booking even without the iCal export", () => {
    const apiOnly = murray.filter((r) => r.uid?.startsWith("lodgify-"));
    expect(guestStays(apiOnly)).toEqual([
      { start: "2026-11-13", end: "2026-11-16" },
      { start: "2026-11-21", end: "2026-11-30" },
    ]);
  });

  it("keeps longer or free-standing closed periods, manual blocks and bookings taken here", () => {
    const rows: UnavailableRow[] = [
      { source: "RESERVATION", start: "2027-02-01", end: "2027-02-04" },
      { source: "EXTERNAL", start: "2027-02-04", end: "2027-02-08", uid: "lodgify-closed-2027-02-04", summary: "Not available in Lodgify" },
      { source: "EXTERNAL", start: "2027-03-01", end: "2027-03-02", uid: "lodgify-closed-2027-03-01", summary: "Not available in Lodgify" },
      { source: "MANUAL_BLOCK", start: "2027-04-01", end: "2027-04-02" },
    ];
    expect(guestStays(rows)).toHaveLength(4);
  });
});
