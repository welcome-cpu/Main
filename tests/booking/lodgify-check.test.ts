import { describe, expect, it } from "vitest";
import { compareWithLodgify } from "@/lib/booking/lodgify-check";

const ours = { checkIn: "2027-03-10", checkOut: "2027-03-13", lodgifyPropertyId: 646178 };
const booked = { status: "Booked", is_deleted: false, canceled_at: null, arrival: "2027-03-10", departure: "2027-03-13", property_id: 646178 };

describe("compareWithLodgify", () => {
  it("is happy when Lodgify matches", () => {
    expect(compareWithLodgify(ours, booked)).toBeNull();
  });

  it("spots a booking cancelled, declined or deleted in Lodgify", () => {
    expect(compareWithLodgify(ours, null)?.mismatch).toBe("CANCELLED");
    expect(compareWithLodgify(ours, { ...booked, is_deleted: true })?.mismatch).toBe("CANCELLED");
    expect(compareWithLodgify(ours, { ...booked, canceled_at: "2027-01-02T10:00:00" })?.mismatch).toBe("CANCELLED");
    expect(compareWithLodgify(ours, { ...booked, status: "Declined" })).toEqual({ mismatch: "CANCELLED", detail: "Lodgify shows it as declined." });
  });

  it("spots changed dates or a different property", () => {
    expect(compareWithLodgify(ours, { ...booked, departure: "2027-03-14" })).toEqual({
      mismatch: "CHANGED",
      detail: "Changed in Lodgify: dates in Lodgify are 2027-03-10 to 2027-03-14 (here 2027-03-10 to 2027-03-13).",
    });
    expect(compareWithLodgify(ours, { ...booked, property_id: 862655 })?.mismatch).toBe("CHANGED");
  });
});
