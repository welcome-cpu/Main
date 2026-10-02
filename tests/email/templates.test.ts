import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  guestBalanceFailed,
  guestBookingConfirmed,
  guestNotCharged,
  ownerNewBooking,
  type BookingEmailData,
} from "@/lib/email/templates";
import type { Quote } from "@/lib/pricing/quote";

const quote: Quote = {
  currency: "GBP",
  checkIn: "2027-02-09",
  checkOut: "2027-02-12",
  nights: [
    { date: "2027-02-09", pricePence: 16500, source: "RATE" },
    { date: "2027-02-10", pricePence: 16500, source: "RATE" },
    { date: "2027-02-11", pricePence: 16500, source: "RATE" },
  ],
  accommodationPence: 49500,
  cleaningFeePence: 0,
  petFeePence: 4000,
  extras: [],
  extrasPence: 0,
  discount: null,
  totalPence: 53500,
  dueNowPence: 26750,
  balancePence: 26750,
  balanceDueDate: "2027-02-02",
};

const data: BookingEmailData = {
  reference: "GC-7K3M9P",
  propertyName: "Muckle View",
  checkIn: "2027-02-09",
  checkOut: "2027-02-12",
  checkInTime: "15:00",
  checkOutTime: "11:00",
  adults: 2,
  children: 0,
  infants: 0,
  pets: 1,
  guestFirstName: "Ann",
  guestLastName: "Guest",
  guestEmail: "ann@example.com",
  guestPhone: "07700 900000",
  guestMessage: null,
  quote,
  siteUrl: "https://gamriechalets.co.uk",
  contactEmail: "welcome@gamriechalets.co.uk",
};

describe("email templates", () => {
  it("confirms the stay, price and payment schedule to the guest", () => {
    const e = guestBookingConfirmed(data);
    expect(e.subject).toBe("Booking confirmed: Muckle View, Tuesday, 9 February 2027 (GC-7K3M9P)");
    for (const s of ["GC-7K3M9P", "Tuesday, 9 February 2027, from 15:00", "Friday, 12 February 2027, by 11:00", "3 nights × £165.00", "Pet fee", "£535.00"]) {
      expect(e.html).toContain(s);
      expect(e.text).toContain(s);
    }
    expect(e.text).toContain("We've taken a deposit of £267.50. The balance of £267.50 will be charged automatically to the same card on Tuesday, 2 February 2027.");
    expect(e.text).toContain("non-refundable");
  });

  it("describes payment in full when there's no balance", () => {
    const e = guestBookingConfirmed({ ...data, quote: { ...quote, dueNowPence: 53500, balancePence: 0, balanceDueDate: null } });
    expect(e.text).toContain("We've taken your payment of £535.00 in full.");
  });

  it("escapes anything the guest typed, so it can't inject HTML", () => {
    const evil = { ...data, guestFirstName: '<img src=x onerror="alert(1)">', guestMessage: "<script>steal()</script>\nhi" };
    for (const e of [guestBookingConfirmed(evil), ownerNewBooking(evil)]) {
      expect(e.html).not.toContain("<script>");
      expect(e.html).not.toContain("<img");
    }
    expect(ownerNewBooking(evil).html).toContain("&lt;script&gt;steal()&lt;/script&gt;<br>hi");
    expect(escapeHtml(`"'&<>`)).toBe("&quot;&#39;&amp;&lt;&gt;");
  });

  it("gives the owner the guest's contact details and message", () => {
    const e = ownerNewBooking({ ...data, guestMessage: "Arriving late" });
    for (const s of ["Ann Guest", "ann@example.com", "07700 900000", "Arriving late"]) expect(e.text).toContain(s);
  });

  it("tells the guest clearly they weren't charged", () => {
    expect(guestNotCharged(data, "DATES_UNAVAILABLE").text).toContain("No money has been taken");
    expect(guestNotCharged(data, "PAYMENT_FAILED").text).toContain("declined");
  });

  it("asks for the balance when the automatic charge fails", () => {
    expect(guestBalanceFailed(data, 26750).text).toContain("balance of £267.50");
  });
});
