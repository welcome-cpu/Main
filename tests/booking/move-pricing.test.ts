import { describe, expect, it } from "vitest";
import { carryDiscount, planMovePayment, repriceExtras } from "@/lib/booking/move-pricing";

describe("repriceExtras", () => {
  const extras = [
    { extraId: "a", name: "Logs", pricingType: "PER_STAY" as const, unitPricePence: 1500, quantity: 2 },
    { extraId: "b", name: "Breakfast", pricingType: "PER_GUEST_PER_NIGHT" as const, unitPricePence: 800, quantity: 1 },
    { extraId: "c", name: "Late checkout", pricingType: "PER_NIGHT" as const, unitPricePence: 500, quantity: 1 },
    { extraId: null, name: "Welcome pack", pricingType: "PER_GUEST" as const, unitPricePence: 300, quantity: 1 },
  ];

  it("keeps the booked prices and works them out for the new length of stay", () => {
    expect(repriceExtras(extras, 5, 2).map((x) => x.totalPence)).toEqual([3000, 8000, 2500, 600]);
    expect(repriceExtras(extras, 2, 2).map((x) => x.totalPence)).toEqual([3000, 3200, 1000, 600]);
  });
});

describe("carryDiscount", () => {
  it("takes the same percentage off the new accommodation price", () => {
    expect(carryDiscount({ pence: 4500, accommodationPence: 45000, type: "PERCENT", percentOff: 10, amountOffPence: null }, 60000)).toBe(6000);
  });
  it("keeps a fixed discount, but never more than the accommodation", () => {
    expect(carryDiscount({ pence: 5000, accommodationPence: 45000, type: "FIXED", percentOff: null, amountOffPence: 5000 }, 60000)).toBe(5000);
    expect(carryDiscount({ pence: 5000, accommodationPence: 45000, type: "FIXED", percentOff: null, amountOffPence: 5000 }, 3000)).toBe(3000);
  });
  it("keeps the same share for a Lodgify promotion", () => {
    expect(carryDiscount({ pence: 6750, accommodationPence: 45000, type: null, percentOff: null, amountOffPence: null }, 30000)).toBe(4500);
  });
  it("is nothing when there was no discount", () => {
    expect(carryDiscount(null, 30000)).toBe(0);
    expect(carryDiscount({ pence: 0, accommodationPence: 45000, type: "PERCENT", percentOff: 10, amountOffPence: null }, 30000)).toBe(0);
  });
});

describe("planMovePayment", () => {
  const base = { oldTotalPence: 45000, hasSavedCard: true, balanceDueDate: "2027-03-01", today: "2027-01-10" };
  const pending = { paymentId: "bal", amountPence: 22500 };

  it("same price with a deposit paid: the balance stays, due before the new arrival", () => {
    expect(planMovePayment({ ...base, newTotalPence: 45000, paidPence: 22500, pendingBalance: pending })).toEqual({
      owedPence: 22500,
      payNowPence: 0,
      creditPence: 0,
      balance: { action: "UPDATE", paymentId: "bal", amountPence: 22500, dueDate: "2027-03-01" },
      chargedAutomatically: true,
    });
  });

  it("dearer dates: the difference is charged now and the balance stays as it was", () => {
    expect(planMovePayment({ ...base, newTotalPence: 60000, paidPence: 22500, pendingBalance: pending })).toMatchObject({
      owedPence: 37500,
      payNowPence: 15000,
      balance: { action: "UPDATE", amountPence: 22500 },
    });
  });

  it("dearer dates after paying in full: only the difference, charged now", () => {
    expect(planMovePayment({ ...base, newTotalPence: 60000, paidPence: 45000, pendingBalance: null })).toEqual({
      owedPence: 15000,
      payNowPence: 15000,
      creditPence: 0,
      balance: { action: "NONE" },
      chargedAutomatically: false,
    });
  });

  it("dearer dates with credit held: the credit is used first", () => {
    expect(planMovePayment({ ...base, oldTotalPence: 40000, newTotalPence: 46000, paidPence: 45000, pendingBalance: null })).toMatchObject({
      owedPence: 1000,
      payNowPence: 1000,
    });
  });

  it("with no saved card, the difference goes on a balance for the owner to collect", () => {
    expect(planMovePayment({ ...base, hasSavedCard: false, newTotalPence: 60000, paidPence: 45000, pendingBalance: null })).toEqual({
      owedPence: 15000,
      payNowPence: 0,
      creditPence: 0,
      balance: { action: "CREATE", amountPence: 15000, dueDate: "2027-03-01" },
      chargedAutomatically: false,
    });
  });

  it("cheaper dates take the difference off the balance", () => {
    expect(planMovePayment({ ...base, newTotalPence: 30000, paidPence: 22500, pendingBalance: pending })).toMatchObject({
      owedPence: 7500,
      payNowPence: 0,
      creditPence: 0,
      balance: { action: "UPDATE", amountPence: 7500 },
    });
  });

  it("cheaper than what's been paid: the balance is called off and the rest held as credit", () => {
    expect(planMovePayment({ ...base, newTotalPence: 20000, paidPence: 22500, pendingBalance: pending })).toEqual({
      owedPence: 0,
      payNowPence: 0,
      creditPence: 2500,
      balance: { action: "CANCEL", paymentId: "bal" },
      chargedAutomatically: false,
    });
  });

  it("paid in full, cheaper dates: credit, nothing to charge", () => {
    expect(planMovePayment({ ...base, newTotalPence: 30000, paidPence: 45000, pendingBalance: null })).toMatchObject({
      owedPence: 0,
      creditPence: 15000,
      balance: { action: "NONE" },
    });
  });

  it("when the usual balance date has passed, the balance is due straight away", () => {
    const plan = planMovePayment({ ...base, balanceDueDate: "2027-01-05", newTotalPence: 45000, paidPence: 22500, pendingBalance: pending });
    expect(plan.balance).toMatchObject({ dueDate: "2027-01-10" });
  });

  it("the same price, paid in full: nothing changes", () => {
    expect(planMovePayment({ ...base, newTotalPence: 45000, paidPence: 45000, pendingBalance: null })).toMatchObject({
      owedPence: 0,
      payNowPence: 0,
      creditPence: 0,
      balance: { action: "NONE" },
    });
  });
});
