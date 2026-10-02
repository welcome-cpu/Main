// The price of a stay, as pure arithmetic over already-loaded data. All
// amounts are integer pence. The browser never supplies any of these
// numbers: the server builds the quote, and Phase 8 stores it on the hold.

import { addDays, daysBetween } from "@/lib/dates";

export type NightPriceSource = "RULE" | "RATE" | "BASE";

/** Per-night price inputs, already filtered to what applies. */
export type NightPriceInput = {
  date: string;
  /** Highest-priority active rate rule price for this night, if any. */
  rulePence: number | null;
  /** Stored nightly rate (Lodgify copy or admin-entered), if usable. */
  ratePence: number | null;
};

export type PricingPolicy = {
  currency: string;
  basePence: number;
  /** When prices are meant to come from Lodgify, a missing night is an error, not the base rate. */
  requireRates: boolean;
  cleaningFeePence: number;
  petFeePence: number;
  depositPercent: number;
  balanceDueDaysBefore: number;
};

export type ExtraDefinition = {
  id: string;
  name: string;
  pricePence: number;
  pricingType: "PER_STAY" | "PER_NIGHT" | "PER_GUEST" | "PER_GUEST_PER_NIGHT";
  maxQuantity: number;
};

export type DiscountDefinition = {
  id: string;
  code: string;
  discountType: "PERCENT" | "FIXED";
  /** Percent as a number, e.g. 10 or 12.5. */
  percentOff: number | null;
  amountOffPence: number | null;
  minNights: number | null;
  /** Inclusive first/last night of the stay window, if any. */
  stayWindow: { start: string; end: string } | null;
  /** Booking date window [start, end), if any. */
  bookingWindow: { start: string; end: string } | null;
  maxRedemptions: number | null;
  redemptions: number;
};

export type QuoteRequest = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  pets: number;
  extras: { id: string; quantity: number }[];
};

export type QuoteLine = { date: string; pricePence: number; source: NightPriceSource };

export type QuoteExtra = {
  extraId: string;
  name: string;
  pricingType: ExtraDefinition["pricingType"];
  unitPricePence: number;
  quantity: number;
  totalPence: number;
};

export type Quote = {
  currency: string;
  checkIn: string;
  checkOut: string;
  nights: QuoteLine[];
  accommodationPence: number;
  cleaningFeePence: number;
  petFeePence: number;
  extras: QuoteExtra[];
  extrasPence: number;
  discount: { id: string; code: string; pence: number } | null;
  totalPence: number;
  /** Charged when booking: the deposit, or the full total. */
  dueNowPence: number;
  balancePence: number;
  /** When the balance is due; null when paying in full now. */
  balanceDueDate: string | null;
};

export type QuoteError =
  | { code: "PRICE_UNAVAILABLE"; message: string }
  | { code: "UNKNOWN_EXTRA"; message: string }
  | { code: "EXTRA_QUANTITY"; message: string }
  | { code: "DISCOUNT_INVALID"; message: string };

export type QuoteResult = { ok: true; quote: Quote } | { ok: false; error: QuoteError };

/** Percentage of an amount in pence, rounded half up. */
export function percentOf(pence: number, percent: number) {
  return Math.round((pence * percent) / 100);
}

export function priceNight(night: NightPriceInput, policy: PricingPolicy): QuoteLine | null {
  if (night.rulePence !== null) return { date: night.date, pricePence: night.rulePence, source: "RULE" };
  if (night.ratePence !== null) return { date: night.date, pricePence: night.ratePence, source: "RATE" };
  if (policy.requireRates) return null;
  return { date: night.date, pricePence: policy.basePence, source: "BASE" };
}

export function buildQuote(input: {
  request: QuoteRequest;
  nights: NightPriceInput[];
  policy: PricingPolicy;
  extras: ExtraDefinition[];
  discount: DiscountDefinition | null;
  /** Property-local date the booking is being made on. */
  today: string;
}): QuoteResult {
  const { request, policy, today } = input;
  const nightCount = daysBetween(request.checkIn, request.checkOut);

  // --- Accommodation ---------------------------------------------------------
  const lines: QuoteLine[] = [];
  for (let i = 0; i < nightCount; i++) {
    const date = addDays(request.checkIn, i);
    const night = input.nights.find((n) => n.date === date) ?? { date, rulePence: null, ratePence: null };
    const line = priceNight(night, policy);
    if (!line) {
      return {
        ok: false,
        error: { code: "PRICE_UNAVAILABLE", message: "We can't price these dates online yet. Please contact us to book." },
      };
    }
    lines.push(line);
  }
  const accommodationPence = lines.reduce((sum, l) => sum + l.pricePence, 0);

  // --- Fees ------------------------------------------------------------------
  const cleaningFeePence = policy.cleaningFeePence;
  const petFeePence = request.pets > 0 ? policy.petFeePence : 0;

  // --- Extras ----------------------------------------------------------------
  const guests = request.adults + request.children;
  const extras: QuoteExtra[] = [];
  for (const chosen of request.extras) {
    if (chosen.quantity === 0) continue;
    const def = input.extras.find((x) => x.id === chosen.id);
    if (!def) return { ok: false, error: { code: "UNKNOWN_EXTRA", message: "One of the extras isn't available." } };

    const perGuest = def.pricingType === "PER_GUEST" || def.pricingType === "PER_GUEST_PER_NIGHT";
    const maxQuantity = perGuest ? 1 : def.maxQuantity;
    if (!Number.isInteger(chosen.quantity) || chosen.quantity < 1 || chosen.quantity > maxQuantity) {
      return { ok: false, error: { code: "EXTRA_QUANTITY", message: `Choose up to ${maxQuantity} of “${def.name}”.` } };
    }

    const multiplier = {
      PER_STAY: chosen.quantity,
      PER_NIGHT: chosen.quantity * nightCount,
      PER_GUEST: guests,
      PER_GUEST_PER_NIGHT: guests * nightCount,
    }[def.pricingType];

    extras.push({
      extraId: def.id,
      name: def.name,
      pricingType: def.pricingType,
      unitPricePence: def.pricePence,
      quantity: chosen.quantity,
      totalPence: def.pricePence * multiplier,
    });
  }
  const extrasPence = extras.reduce((sum, x) => sum + x.totalPence, 0);

  // --- Discount (accommodation only) ------------------------------------------
  let discount: Quote["discount"] = null;
  if (input.discount) {
    const problem = discountProblem(input.discount, request, nightCount, today);
    if (problem) return { ok: false, error: { code: "DISCOUNT_INVALID", message: problem } };
    const d = input.discount;
    const pence =
      d.discountType === "PERCENT"
        ? percentOf(accommodationPence, d.percentOff!)
        : Math.min(d.amountOffPence!, accommodationPence);
    discount = { id: d.id, code: d.code, pence };
  }

  // --- Totals and payment schedule --------------------------------------------
  const totalPence = accommodationPence + cleaningFeePence + petFeePence + extrasPence - (discount?.pence ?? 0);

  // Deposit now and balance later only if the balance due date is still in
  // the future; otherwise the guest pays in full when booking.
  const dueDate = addDays(request.checkIn, -policy.balanceDueDaysBefore);
  const splitPayment = policy.depositPercent < 100 && dueDate > today;
  const dueNowPence = splitPayment ? percentOf(totalPence, policy.depositPercent) : totalPence;

  return {
    ok: true,
    quote: {
      currency: policy.currency,
      checkIn: request.checkIn,
      checkOut: request.checkOut,
      nights: lines,
      accommodationPence,
      cleaningFeePence,
      petFeePence,
      extras,
      extrasPence,
      discount,
      totalPence,
      dueNowPence,
      balancePence: totalPence - dueNowPence,
      balanceDueDate: splitPayment ? dueDate : null,
    },
  };
}

function discountProblem(d: DiscountDefinition, request: QuoteRequest, nights: number, today: string): string | null {
  if (d.minNights !== null && nights < d.minNights) return `This code needs a stay of at least ${d.minNights} nights.`;
  if (d.stayWindow && (request.checkIn < d.stayWindow.start || addDays(request.checkOut, -1) > d.stayWindow.end)) {
    return "This code isn't valid for these dates.";
  }
  if (d.bookingWindow && (today < d.bookingWindow.start || today >= d.bookingWindow.end)) {
    return "This code has expired or isn't active yet.";
  }
  if (d.maxRedemptions !== null && d.redemptions >= d.maxRedemptions) return "This code has been fully used.";
  return null;
}

/** Consecutive nights at the same price, for display ("3 nights × £165"). */
export function groupNights(lines: QuoteLine[]) {
  const groups: { from: string; nights: number; pricePence: number }[] = [];
  for (const l of lines) {
    const last = groups.at(-1);
    if (last && last.pricePence === l.pricePence) last.nights++;
    else groups.push({ from: l.date, nights: 1, pricePence: l.pricePence });
  }
  return groups;
}
