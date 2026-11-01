import { describe, expect, it } from "vitest";
import { lodgifyNote, parseLodgifyBookingId, type LodgifyPushRow } from "@/lib/booking/lodgify-push";
import type { Quote } from "@/lib/pricing/quote";

const row = (overrides: Partial<LodgifyPushRow> = {}): LodgifyPushRow => ({
  id: "r1",
  reference: "GC-ABC123",
  checkIn: "2027-03-01",
  checkOut: "2027-03-04",
  adults: 2,
  children: 0,
  infants: 0,
  pets: 1,
  guestMessage: null,
  totalPence: 53500,
  currency: "GBP",
  balanceDueDate: "2027-02-01",
  quote: { extras: [{ name: "Logs", quantity: 2 }], discount: { id: "d", code: "SPRING", pence: 2000 } } as unknown as Quote,
  lodgifyPropertyId: 1,
  lodgifyRoomTypeId: 2,
  firstName: "A",
  lastName: "B",
  email: "a@example.com",
  phone: null,
  country: "GB",
  addressLine1: null,
  addressLine2: null,
  city: null,
  postalCode: null,
  cardPaidPence: 26750,
  voucherPaidPence: 0,
  voucherCode: null,
  ...overrides,
});

describe("Lodgify booking note", () => {
  it("says what's paid and that the website collects the balance", () => {
    const note = lodgifyNote(row());
    expect(note).toContain("reference GC-ABC123");
    expect(note).toContain("Paid on the website: £267.50 by card.");
    expect(note).toContain("Balance £267.50 due 2027-02-01: the website charges the guest's card automatically. Don't request payment in Lodgify.");
    expect(note).toContain("Pets: 1.");
    expect(note).toContain("Extras: Logs × 2.");
    expect(note).toContain("Discount code SPRING: −£20.00.");
  });

  it("includes a gift voucher alongside the card", () => {
    const note = lodgifyNote(row({ cardPaidPence: 43500, voucherPaidPence: 10000, voucherCode: "GIFT-1", balanceDueDate: null }));
    expect(note).toContain("£435.00 by card, £100.00 by gift voucher GIFT-1.");
    expect(note).toContain("Paid in full.");
  });
});

describe("parseLodgifyBookingId", () => {
  it("reads the bare booking number Lodgify returns", () => {
    expect(parseLodgifyBookingId("123456")).toBe(123456);
    expect(parseLodgifyBookingId('{"id":42}')).toBe(42);
    expect(parseLodgifyBookingId('"nope"')).toBeNull();
  });
});
