// Which unavailable dates are guests staying, for the heating plan. Pure, so
// it's easy to test.
//
// Lodgify blocks "Preparation Time" either side of each booking (one night at
// Murray Cottage). These aren't stays: counting them made a guest seem to
// arrive the day the last one left. They show up two ways:
// - in Lodgify's iCal export, as events called "Preparation Time";
// - in Lodgify's API feed, as closed periods with no booking and no name
//   ("lodgify-closed-<date>").
// A closed period is treated as preparation time when the iCal export has a
// "Preparation Time" event on the same dates, or, if it doesn't, when it's one
// or two nights touching a booking. Any other closed period still counts as a
// stay, as do manual blocks, so the heating errs towards warm.

import type { Stay } from "@/lib/heating/plan";

export type UnavailableRow = {
  source: "RESERVATION" | "MANUAL_BLOCK" | "EXTERNAL";
  start: string;
  end: string;
  uid?: string | null;
  summary?: string | null;
};

const PREP_NIGHTS_MAX = 2;

const isPrepEvent = (r: UnavailableRow) => r.source === "EXTERNAL" && /^\s*preparation time\s*$/i.test(r.summary ?? "");
const isLodgifyClosed = (r: UnavailableRow) => r.source === "EXTERNAL" && (r.uid ?? "").startsWith("lodgify-closed-");
const nights = (r: UnavailableRow) => Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86_400_000);

export function guestStays(rows: UnavailableRow[]): Stay[] {
  const prepDates = new Set(rows.filter(isPrepEvent).map((r) => `${r.start}/${r.end}`));
  const bookings = rows.filter((r) => !isPrepEvent(r) && !isLodgifyClosed(r) && r.source !== "MANUAL_BLOCK");
  const touchesBooking = (r: UnavailableRow) => bookings.some((b) => b.start === r.end || b.end === r.start);

  return rows
    .filter((r) => {
      if (isPrepEvent(r)) return false;
      if (isLodgifyClosed(r)) {
        if (prepDates.has(`${r.start}/${r.end}`)) return false;
        if (nights(r) <= PREP_NIGHTS_MAX && touchesBooking(r)) return false;
      }
      return true;
    })
    .map((r) => ({ start: r.start, end: r.end }));
}
