import { describe, expect, it } from "vitest";
import {
  allocateToCardPayments,
  calculateCancellationRefund,
  splitRefund,
  type RefundInput,
} from "@/lib/booking/cancellation-refund";
import { NEW_TERMS_FROM } from "@/lib/booking/terms";

const arrival = "2027-08-01";
/** Noon in the UK, this many days before arrival. */
const daysBefore = (n: number) => new Date(Date.parse(`${arrival}T11:00:00Z`) - n * 86_400_000);
const after = new Date(NEW_TERMS_FROM.getTime() + 1000);

const refund = (overrides: Partial<RefundInput> = {}) =>
  calculateCancellationRefund({
    totalPence: 50000,
    paidPence: 50000,
    arrivalDate: arrival,
    bookedAt: after,
    cancelledAt: daysBefore(40),
    ...overrides,
  });

describe("calculateCancellationRefund", () => {
  it("refunds everything paid at exactly 30 days", () => {
    expect(refund({ cancelledAt: daysBefore(30), paidPence: 25000 })).toEqual({ rule: "FULL", daysBefore: 30, refundPence: 25000 });
  });

  it("refunds 50% of the total at 29 days", () => {
    expect(refund({ cancelledAt: daysBefore(29) })).toEqual({ rule: "HALF_OF_TOTAL", daysBefore: 29, refundPence: 25000 });
  });

  it("refunds 50% of the total at exactly 7 days", () => {
    expect(refund({ cancelledAt: daysBefore(7) })).toEqual({ rule: "HALF_OF_TOTAL", daysBefore: 7, refundPence: 25000 });
  });

  it("refunds nothing at 6 days", () => {
    expect(refund({ cancelledAt: daysBefore(6) })).toEqual({ rule: "NONE", daysBefore: 6, refundPence: 0 });
  });

  it("caps the 50% at what's been paid", () => {
    expect(refund({ cancelledAt: daysBefore(10), paidPence: 10000 }).refundPence).toBe(10000);
  });

  it("gives back a whole 50% deposit at 7 to 29 days, as 50% of the total", () => {
    expect(refund({ cancelledAt: daysBefore(10), paidPence: 25000 }).refundPence).toBe(25000);
  });

  it("rounds an odd total to the penny", () => {
    expect(refund({ cancelledAt: daysBefore(10), totalPence: 50001 }).refundPence).toBe(25001);
  });

  it("refunds nothing on the day of arrival or after", () => {
    expect(refund({ cancelledAt: daysBefore(0) }).refundPence).toBe(0);
    expect(refund({ cancelledAt: daysBefore(-2) }).refundPence).toBe(0);
  });

  describe("bookings made within 7 days of arrival", () => {
    it("refunds nothing, even when cancelled straight away", () => {
      const made = daysBefore(5);
      expect(refund({ bookedAt: new Date(Math.max(made.getTime(), after.getTime())), cancelledAt: made })).toEqual({ rule: "NONE", daysBefore: 5, refundPence: 0 });
    });

    it("treats exactly 7 days as 50%, even if booked that day", () => {
      expect(refund({ bookedAt: after, cancelledAt: daysBefore(7) }).refundPence).toBe(25000);
    });
  });

  describe("moved bookings", () => {
    const newArrival = "2027-12-01";

    it("keeps the full refund of the day it moved, however close the new arrival is", () => {
      const r = refund({
        arrivalDate: newArrival,
        cancelledAt: new Date("2027-11-30T12:00:00Z"),
        move: { movedAt: daysBefore(30), arrivalWhenMoved: arrival },
      });
      expect(r).toEqual({ rule: "FULL", daysBefore: 30, refundPence: 50000 });
    });

    it("keeps the 50% of the day it moved, however far off the new arrival is", () => {
      const r = refund({
        arrivalDate: newArrival,
        cancelledAt: daysBefore(7),
        move: { movedAt: daysBefore(7), arrivalWhenMoved: arrival },
      });
      expect(r).toEqual({ rule: "HALF_OF_TOTAL", daysBefore: 7, refundPence: 25000 });
    });

    it("keeps no refund if it moved under 7 days before, however far off the new arrival is", () => {
      const r = refund({
        arrivalDate: newArrival,
        cancelledAt: daysBefore(3),
        move: { movedAt: daysBefore(6), arrivalWhenMoved: arrival },
      });
      expect(r).toEqual({ rule: "NONE", daysBefore: 6, refundPence: 0 });
    });
  });

  describe("UK time", () => {
    it("counts the UK date during British Summer Time, not the UTC one", () => {
      // 23:30 UTC on 2 July is already 3 July in the UK: 29 days before, not 30.
      expect(refund({ cancelledAt: new Date("2027-07-02T23:30:00Z") })).toMatchObject({ rule: "HALF_OF_TOTAL", daysBefore: 29 });
      // A minute before UK midnight is still 2 July: 30 days before.
      expect(refund({ cancelledAt: new Date("2027-07-02T22:59:00Z") })).toMatchObject({ rule: "FULL", daysBefore: 30 });
    });

    it("counts correctly across the clocks changing", () => {
      expect(refund({ arrivalDate: "2027-04-10", cancelledAt: new Date("2027-03-11T12:00:00Z") })).toMatchObject({ rule: "FULL", daysBefore: 30 });
    });
  });

  it("keeps bookings made before the new policy non-refundable", () => {
    expect(refund({ bookedAt: new Date(NEW_TERMS_FROM.getTime() - 1000), cancelledAt: daysBefore(60) })).toEqual({ rule: "OLD_TERMS", daysBefore: 60, refundPence: 0 });
  });
});

describe("splitRefund", () => {
  it("shares a refund in proportion to how the guest paid", () => {
    expect(splitRefund(10000, { cardPence: 15000, voucherPence: 5000, manualPence: 0 })).toEqual({ cardPence: 7500, voucherPence: 2500, manualPence: 0 });
  });

  it("always adds up to the refund", () => {
    const s = splitRefund(10001, { cardPence: 3333, voucherPence: 3333, manualPence: 3334 });
    expect(s.cardPence + s.voucherPence + s.manualPence).toBe(10001);
  });

  it("copes with no card payment", () => {
    expect(splitRefund(1001, { cardPence: 0, voucherPence: 2002, manualPence: 0 })).toEqual({ cardPence: 0, voucherPence: 1001, manualPence: 0 });
    const s = splitRefund(1001, { cardPence: 0, voucherPence: 1000, manualPence: 1000 });
    expect(s.cardPence).toBe(0);
    expect(s.voucherPence + s.manualPence).toBe(1001);
  });

  it("is nothing when there's nothing to refund", () => {
    expect(splitRefund(0, { cardPence: 100, voucherPence: 0, manualPence: 0 })).toEqual({ cardPence: 0, voucherPence: 0, manualPence: 0 });
  });
});

describe("allocateToCardPayments", () => {
  it("takes from the newest payment first, never more than each can give", () => {
    expect(
      allocateToCardPayments(15000, [
        { id: "balance", refundablePence: 10000 },
        { id: "deposit", refundablePence: 10000 },
      ])
    ).toEqual([
      { id: "balance", refundablePence: 10000, pence: 10000 },
      { id: "deposit", refundablePence: 10000, pence: 5000 },
    ]);
  });
});
