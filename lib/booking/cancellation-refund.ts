// The refund rules for a cancelled booking. Pure, so every boundary can be
// tested. Days are counted between calendar dates in the UK, whatever time of
// day it is and wherever the server runs.

import { isOnOldTerms } from "@/lib/booking/terms";
import { daysBetween, todayInZone } from "@/lib/dates";

const UK = "Europe/London";

export type RefundRule =
  /** 30 or more days before arrival: everything paid, except credit held after a move. */
  | "FULL"
  /** 7 to 29 days: 50% of the total booking value, capped at what's been paid. */
  | "HALF_OF_TOTAL"
  /** Under 7 days: nothing. */
  | "NONE"
  /** Booked before the policy took effect: non-refundable, as the guest accepted. */
  | "OLD_TERMS";

export type RefundInput = {
  totalPence: number;
  /** Paid so far by any means, less anything already refunded. */
  paidPence: number;
  /** The current arrival date, YYYY-MM-DD. */
  arrivalDate: string;
  bookedAt: Date;
  /** When the booking is being cancelled. */
  cancelledAt: Date;
  /** Set if the booking has been moved. */
  move?: { movedAt: Date; arrivalWhenMoved: string } | null;
};

export type RefundDecision = {
  rule: RefundRule;
  /** The days before arrival the rule was chosen from. */
  daysBefore: number;
  refundPence: number;
  /**
   * For a moved booking, which measure gave the (smaller) refund: the day it
   * moved against the arrival it had then, or today against the new arrival.
   */
  basis?: "MOVE_DAY" | "NEW_DATES";
};

function byDays(daysBefore: number, totalPence: number, paidPence: number): RefundDecision {
  // Credit held after a move to cheaper dates (paid beyond the total) isn't refundable.
  if (daysBefore >= 30) return { rule: "FULL", daysBefore, refundPence: Math.min(paidPence, totalPence) };
  if (daysBefore >= 7) {
    return { rule: "HALF_OF_TOTAL", daysBefore, refundPence: Math.min(Math.round(totalPence / 2), paidPence) };
  }
  return { rule: "NONE", daysBefore, refundPence: 0 };
}

export function calculateCancellationRefund(input: RefundInput): RefundDecision {
  const { totalPence, paidPence, arrivalDate, bookedAt, cancelledAt, move } = input;

  const now = daysBetween(todayInZone(UK, cancelledAt), arrivalDate);
  if (isOnOldTerms(bookedAt)) return { rule: "OLD_TERMS", daysBefore: now, refundPence: 0 };
  if (!move) return byDays(now, totalPence, paidPence);

  // A moved booking keeps the terms of the day it moved (measured against the
  // arrival date it had that day), or those for its new dates if stricter:
  // the rental agreement lets the host keep whichever is greater.
  const onMoveDay = byDays(daysBetween(todayInZone(UK, move.movedAt), move.arrivalWhenMoved), totalPence, paidPence);
  const onNewDates = byDays(now, totalPence, paidPence);
  return onNewDates.refundPence < onMoveDay.refundPence
    ? { ...onNewDates, basis: "NEW_DATES" }
    : { ...onMoveDay, basis: "MOVE_DAY" };
}

export type PaidBy = { cardPence: number; voucherPence: number; manualPence: number };

/**
 * Shares a refund across how the guest paid, in proportion. Any rounding
 * falls on the card, since that's the part refunded automatically.
 */
export function splitRefund(refundPence: number, paid: PaidBy): PaidBy {
  const total = paid.cardPence + paid.voucherPence + paid.manualPence;
  if (refundPence <= 0 || total <= 0) return { cardPence: 0, voucherPence: 0, manualPence: 0 };
  const share = (pence: number) => Math.round((refundPence * pence) / total);
  let voucherPence = share(paid.voucherPence);
  let manualPence = share(paid.manualPence);
  // With no card payment there's no card to take the rounding.
  if (paid.cardPence === 0) {
    if (paid.manualPence === 0) voucherPence = refundPence;
    else manualPence = refundPence - voucherPence;
  }
  return { cardPence: refundPence - voucherPence - manualPence, voucherPence, manualPence };
}

/** Which card payments the card part comes off: most recent first. */
export function allocateToCardPayments<P extends { refundablePence: number }>(cardPence: number, newestFirst: P[]) {
  let left = cardPence;
  const allocated: (P & { pence: number })[] = [];
  for (const payment of newestFirst) {
    const pence = Math.min(left, payment.refundablePence);
    if (pence > 0) allocated.push({ ...payment, pence });
    left -= pence;
  }
  return allocated;
}

export function describeRefundRule(decision: RefundDecision) {
  const when =
    decision.basis === "MOVE_DAY"
      ? `It was ${decision.daysBefore} days before arrival when the booking was moved`
      : decision.basis === "NEW_DATES"
        ? `It's ${decision.daysBefore} days before the new arrival (stricter than on the day it moved)`
        : `It's ${decision.daysBefore} days before arrival`;
  switch (decision.rule) {
    case "OLD_TERMS":
      return "Booked before the new policy, so its payments are non-refundable.";
    case "FULL":
      return `${when}: 100% of what's been paid${decision.basis ? ", apart from any credit held" : ""}.`;
    case "HALF_OF_TOTAL":
      return `${when}: 50% of the total booking value, up to what's been paid.`;
    case "NONE":
      return `${when}: no refund.`;
  }
}
