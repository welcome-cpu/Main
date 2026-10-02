import "server-only";
import { checkAvailability } from "@/lib/booking/availability";
import type { AvailabilityResult, StayRequest } from "@/lib/booking/availability-rules";
import { addDays, isValidDate, todayInZone } from "@/lib/dates";
import type { Sql, Tx } from "@/lib/db/client";
import {
  buildQuote,
  type DiscountDefinition,
  type ExtraDefinition,
  type NightPriceInput,
  type PricingPolicy,
  type QuoteResult,
} from "@/lib/pricing/quote";

export type StayQuoteRequest = StayRequest & {
  extras: { id: string; quantity: number }[];
  discountCode?: string | null;
};

export type StayQuote = {
  availability: AvailabilityResult;
  /** Present only when the stay is available. */
  pricing: QuoteResult | null;
};

/**
 * Availability plus a server-calculated price for a stay. This is the only
 * place prices are worked out; anything that takes payment must call it
 * again on the server rather than trust a figure shown in the browser.
 */
export async function quoteStay(
  sql: Sql | Tx,
  propertyId: string,
  request: StayQuoteRequest,
  options: { ignoreBookingRules?: boolean; excludeReservationId?: string; now?: Date } = {}
): Promise<StayQuote | null> {
  const availability = await checkAvailability(sql, propertyId, request, options);
  if (!availability) return null;
  if (!availability.available) return { availability, pricing: null };

  const [policyRow] = await sql<(PricingPolicy & { timezone: string; rateSource: string })[]>`
    SELECT currency, base_nightly_pence AS base_pence, cleaning_fee_pence, pet_fee_pence,
           deposit_percent, balance_due_days_before, timezone, rate_source
    FROM properties WHERE id = ${propertyId}
  `;
  const policy: PricingPolicy = { ...policyRow, requireRates: policyRow.rateSource === "LODGIFY" };

  const lastNight = addDays(request.checkOut, -1);
  const [nights, extras, discount] = await Promise.all([
    sql<NightPriceInput[]>`
      SELECT d::date::text AS date,
        (SELECT r.price_pence FROM rate_rules r
          WHERE r.property_id = ${propertyId} AND r.is_active AND r.price_pence IS NOT NULL
            AND r.nights @> d::date
          ORDER BY r.priority DESC, r.created_at DESC LIMIT 1) AS rule_pence,
        (SELECT n.price_pence FROM nightly_rates n
          WHERE n.property_id = ${propertyId} AND n.night = d::date
            AND (n.source = 'ADMIN' OR ${policyRow.rateSource} = 'LODGIFY')) AS rate_pence
      FROM generate_series(${request.checkIn}::date, ${lastNight}::date, interval '1 day') AS d
    `,
    loadExtras(sql, propertyId),
    request.discountCode ? loadDiscount(sql, propertyId, request.discountCode) : Promise.resolve(null),
  ]);

  if (request.discountCode && !discount) {
    return {
      availability,
      pricing: { ok: false, error: { code: "DISCOUNT_INVALID", message: "We don't recognise that code." } },
    };
  }

  return {
    availability,
    pricing: buildQuote({
      request: { ...request, extras: request.extras },
      nights,
      policy,
      extras,
      discount,
      today: todayInZone(policyRow.timezone, options.now),
    }),
  };
}

/** Active extras offered at a property (its own and those for every property). */
export async function loadExtras(sql: Sql | Tx, propertyId: string) {
  return sql<(ExtraDefinition & { description: string | null })[]>`
    SELECT id, name, description, price_pence, pricing_type, max_quantity
    FROM extras
    WHERE is_active AND (property_id = ${propertyId} OR property_id IS NULL)
    ORDER BY sort_order, name
  `;
}

async function loadDiscount(sql: Sql | Tx, propertyId: string, code: string): Promise<DiscountDefinition | null> {
  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z0-9_-]{3,32}$/.test(normalised)) return null;

  const [row] = await sql<
    (Omit<DiscountDefinition, "stayWindow" | "bookingWindow" | "percentOff"> & {
      percentOff: string | null;
      stayStart: string | null;
      stayEnd: string | null;
      bookStart: string | null;
      bookEnd: string | null;
    })[]
  >`
    SELECT d.id, d.code, d.discount_type, d.percent_off, d.amount_off_pence, d.min_nights,
      lower(d.stay_window)::text AS stay_start, (upper(d.stay_window) - 1)::text AS stay_end,
      lower(d.booking_window)::text AS book_start, upper(d.booking_window)::text AS book_end,
      d.max_redemptions,
      (SELECT count(*)::int FROM reservations r
        WHERE r.discount_code_id = d.id
          AND (r.status = 'CONFIRMED' OR (r.status = 'HOLD' AND r.hold_expires_at > now()))) AS redemptions
    FROM discount_codes d
    WHERE d.code = ${normalised} AND d.is_active
      AND (d.property_id IS NULL OR d.property_id = ${propertyId})
  `;
  if (!row) return null;

  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType,
    percentOff: row.percentOff === null ? null : Number(row.percentOff),
    amountOffPence: row.amountOffPence,
    minNights: row.minNights,
    stayWindow: row.stayStart && row.stayEnd && isValidDate(row.stayStart) ? { start: row.stayStart, end: row.stayEnd } : null,
    bookingWindow: row.bookStart && row.bookEnd ? { start: row.bookStart, end: row.bookEnd } : null,
    maxRedemptions: row.maxRedemptions,
    redemptions: row.redemptions,
  };
}
