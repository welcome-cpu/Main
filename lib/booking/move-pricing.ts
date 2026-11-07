// Moving a booking to new dates: the arithmetic, kept apart from the database
// so each rule can be tested on its own. All amounts are integer pence.
//
// Moving is an owner action, so there are no limits on when or where to: the
// owner decides. The new price comes from the same nightly prices and fees as
// a new booking; the guest's extras and discount come with them.

import { percentOf, type ExtraDefinition, type QuoteExtra } from "@/lib/pricing/quote";

/** The later of two ISO dates. */
const maxDate = (a: string, b: string) => (a > b ? a : b);

export type BookedExtra = {
  extraId: string | null;
  name: string;
  pricingType: ExtraDefinition["pricingType"];
  unitPricePence: number;
  quantity: number;
};

/** The extras the guest chose, at the prices they booked at, for the new number of nights. */
export function repriceExtras(extras: BookedExtra[], nights: number, guests: number): QuoteExtra[] {
  return extras.map((x) => {
    const multiplier = {
      PER_STAY: x.quantity,
      PER_NIGHT: x.quantity * nights,
      PER_GUEST: guests,
      PER_GUEST_PER_NIGHT: guests * nights,
    }[x.pricingType];
    return {
      extraId: x.extraId ?? "",
      name: x.name,
      pricingType: x.pricingType,
      unitPricePence: x.unitPricePence,
      quantity: x.quantity,
      totalPence: x.unitPricePence * multiplier,
    };
  });
}

export type BookedDiscount = {
  /** The discount on the original booking, in pence. */
  pence: number;
  /** The original accommodation price it was taken from. */
  accommodationPence: number;
  /** Known for our own codes; null for a Lodgify promotion. */
  type: "PERCENT" | "FIXED" | null;
  percentOff: number | null;
  amountOffPence: number | null;
};

/**
 * The guest keeps their discount on the new dates, whether or not the code
 * would still be accepted: a percentage of the new accommodation price, or the
 * same fixed amount. A Lodgify promotion (whose terms we don't hold) keeps the
 * same share of the accommodation price.
 */
export function carryDiscount(d: BookedDiscount | null, newAccommodationPence: number): number {
  if (!d || d.pence <= 0) return 0;
  if (d.type === "PERCENT" && d.percentOff !== null) return percentOf(newAccommodationPence, d.percentOff);
  if (d.type === "FIXED" && d.amountOffPence !== null) return Math.min(d.amountOffPence, newAccommodationPence);
  if (d.accommodationPence <= 0) return 0;
  return Math.min(newAccommodationPence, Math.round((newAccommodationPence * d.pence) / d.accommodationPence));
}

export type MovePaymentPlan = {
  /** Still to pay at the new price (0 if paid in full or more). */
  owedPence: number;
  /** Paid beyond the new price, held as credit for a future stay. */
  creditPence: number;
  /** What happens to the balance payment. */
  balance:
    | { action: "NONE" }
    | { action: "CANCEL"; paymentId: string }
    | { action: "UPDATE"; paymentId: string; amountPence: number; dueDate: string }
    | { action: "CREATE"; amountPence: number; dueDate: string };
  /** Whether the saved card will be charged automatically; if not, the owner collects it. */
  chargedAutomatically: boolean;
};

/**
 * How the money changes when a booking moves. Whatever is still owed at the
 * new price becomes the balance, due on the usual date before the new arrival
 * (or straight away, if that date has passed), and is charged to the card the
 * guest saved when paying their deposit. A guest who paid in full had no card
 * saved, so any extra is collected by the owner. Money paid beyond the new
 * price is held as credit.
 */
export function planMovePayment(input: {
  newTotalPence: number;
  paidPence: number;
  pendingBalance: { paymentId: string; amountPence: number } | null;
  hasSavedCard: boolean;
  /** The usual balance date for the new arrival. */
  balanceDueDate: string;
  today: string;
}): MovePaymentPlan {
  const difference = input.newTotalPence - input.paidPence;
  const owedPence = Math.max(0, difference);
  const creditPence = Math.max(0, -difference);
  const dueDate = maxDate(input.balanceDueDate, input.today);
  const pending = input.pendingBalance;

  if (owedPence === 0) {
    return {
      owedPence,
      creditPence,
      balance: pending ? { action: "CANCEL", paymentId: pending.paymentId } : { action: "NONE" },
      chargedAutomatically: false,
    };
  }
  if (pending) {
    return {
      owedPence,
      creditPence,
      balance: { action: "UPDATE", paymentId: pending.paymentId, amountPence: owedPence, dueDate },
      chargedAutomatically: input.hasSavedCard,
    };
  }
  return {
    owedPence,
    creditPence,
    balance: { action: "CREATE", amountPence: owedPence, dueDate },
    chargedAutomatically: input.hasSavedCard,
  };
}
