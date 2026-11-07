import "server-only";
import type { AdminUser } from "@/lib/admin/users";
import { recordAudit } from "@/lib/audit";
import { checkAvailability } from "@/lib/booking/availability";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import {
  carryDiscount,
  planMovePayment,
  repriceExtras,
  type BookedExtra,
  type MovePaymentPlan,
} from "@/lib/booking/move-pricing";
import { isOnOldTerms } from "@/lib/booking/terms";
import { addDays, daysBetween, isValidDate, todayInZone, zonedTimeToUtc } from "@/lib/dates";
import { db, type Sql, type Tx } from "@/lib/db/client";
import { enqueueBookingMovedEmail } from "@/lib/email/booking-emails";
import { logError } from "@/lib/log";
import type { PaymentGateway } from "@/lib/payments/gateway";
import { priceStay } from "@/lib/pricing/quote-service";
import type { Quote } from "@/lib/pricing/quote";

// Moving a confirmed booking to new dates. This is the owner's decision, so
// nothing limits when or where a booking can move: the published terms (48
// hours, 12 months, same length or longer, once) are shown as warnings only.
// The only hard stops are dates that are taken and nights with no price.
//
// The owner sees the new price and what it means for payment, then approves
// that exact price. Lodgify can't be changed from here: until its dates are
// changed there too, the booking shows as different in Lodgify and its
// balance isn't charged.

export type MovePreview = {
  reference: string;
  from: { checkIn: string; checkOut: string; nights: number };
  to: { checkIn: string; checkOut: string; nights: number };
  oldTotalPence: number;
  newTotalPence: number;
  paidPence: number;
  quote: Quote;
  plan: MovePaymentPlan;
  /** Things the published terms wouldn't allow, for the owner to weigh up. */
  warnings: string[];
  lodgifyBookingId: number | null;
  newTerms: boolean;
};

type MoveResult = { ok: true; preview: MovePreview; chargeError?: string } | { ok: false; error: string };

type Loaded = {
  status: string;
  reference: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  totalPence: number;
  accommodationPence: number;
  discountPence: number;
  discountCodeId: string | null;
  priceBreakdown: Quote;
  createdAt: Date;
  movedAt: Date | null;
  lodgifyBookingId: number | null;
  propertyName: string;
  timezone: string;
  checkInTime: string;
  balanceDueDaysBefore: number;
};

async function workOutMove(sql: Sql | Tx, id: string, checkIn: string, checkOut: string, now: Date): Promise<MoveResult & { extras?: (BookedExtra & { id: string })[]; card?: { customerId: string; paymentMethodId: string } | null; previous?: Quote; propertyName?: string }> {
  if (!isValidDate(checkIn) || !isValidDate(checkOut) || checkOut <= checkIn) {
    return { ok: false, error: "Choose a check-out date after the check-in date." };
  }
  const [r] = await sql<Loaded[]>`
    SELECT r.status, r.reference, r.property_id, r.check_in::text, r.check_out::text, r.adults, r.children, r.infants, r.pets,
           r.total_pence, r.accommodation_pence, r.discount_pence, r.discount_code_id, r.price_breakdown, r.created_at,
           r.moved_at, r.lodgify_booking_id, p.name AS property_name, p.timezone, to_char(p.check_in_time, 'HH24:MI') AS check_in_time,
           p.balance_due_days_before
    FROM reservations r JOIN properties p ON p.id = r.property_id
    WHERE r.id = ${id}
  `;
  if (!r) return { ok: false, error: "Booking not found." };
  if (r.status !== "CONFIRMED") return { ok: false, error: "Only confirmed bookings can be moved." };
  if (checkIn === r.checkIn && checkOut === r.checkOut) return { ok: false, error: "Those are the booking's dates already." };

  const payments = await sql<{ id: string; kind: string; status: string; amountPence: number; refundedPence: number; createdAt: Date; customerId: string | null; paymentMethodId: string | null }[]>`
    SELECT id, kind, status, amount_pence, refunded_pence, created_at,
           stripe_customer_id AS customer_id, stripe_payment_method_id AS payment_method_id
    FROM payments WHERE reservation_id = ${id} ORDER BY created_at
  `;
  if (payments.some((p) => p.status === "AUTHORISED")) {
    return { ok: false, error: "A payment on this booking is still being processed. Try again in a few minutes." };
  }
  const balances = payments.filter((p) => p.kind === "BALANCE");
  const lastBalance = balances.at(-1);
  if (lastBalance?.status === "FAILED") {
    return { ok: false, error: "This booking's balance payment failed. Sort that out first (retry it or record it as paid), then move the booking." };
  }
  const paidPence = payments.filter((p) => p.status === "SUCCEEDED").reduce((sum, p) => sum + p.amountPence - p.refundedPence, 0);
  const pending = balances.find((p) => p.status === "PENDING");
  const withCard = balances.find((p) => p.customerId && p.paymentMethodId);
  const card = withCard ? { customerId: withCard.customerId!, paymentMethodId: withCard.paymentMethodId! } : null;

  const stay = { checkIn, checkOut, adults: r.adults, children: r.children, infants: r.infants, pets: r.pets };
  const availability = await checkAvailability(sql, r.propertyId, stay, { ignoreBookingRules: true, excludeReservationId: id, now });
  if (!availability) return { ok: false, error: "This property can't be found." };

  // Lodgify's copy of this booking still has the old dates: it isn't a clash.
  const ownCopies = r.lodgifyBookingId
    ? (await sql<{ id: string }[]>`
        SELECT id::text FROM external_events WHERE property_id = ${r.propertyId} AND uid = ${`lodgify-booking-${r.lodgifyBookingId}`}
      `).map((e) => e.id)
    : [];
  const clashes = availability.conflicts.filter((c) => !(c.kind === "EXTERNAL" && ownCopies.includes(c.ref)));
  if (clashes.length > 0) {
    const what = clashes.map((c) => (c.kind === "MANUAL_BLOCK" ? "a block you added" : c.kind === "EXTERNAL" ? `a ${c.source ?? "calendar"} booking` : `booking ${c.ref}`));
    return { ok: false, error: `Those dates (with turnover) clash with ${[...new Set(what)].join(", ")}.` };
  }

  const priced = await priceStay(sql, r.propertyId, { ...stay, extras: [] }, now);
  if (!priced.ok) return { ok: false, error: `Those nights can't be priced: ${priced.error.message}` };
  const base = priced.quote;

  const nights = daysBetween(checkIn, checkOut);
  const bookedExtras = await sql<(BookedExtra & { id: string })[]>`
    SELECT id, extra_id, name, pricing_type, unit_price_pence, quantity FROM reservation_extras WHERE reservation_id = ${id} ORDER BY name
  `;
  const extras = repriceExtras(bookedExtras, nights, r.adults + r.children);
  const extrasPence = extras.reduce((sum, x) => sum + x.totalPence, 0);

  let discount: Quote["discount"] = null;
  if (r.discountPence > 0) {
    const [code] = r.discountCodeId
      ? await sql<{ discountType: "PERCENT" | "FIXED"; percentOff: string | null; amountOffPence: number | null }[]>`
          SELECT discount_type, percent_off, amount_off_pence FROM discount_codes WHERE id = ${r.discountCodeId}
        `
      : [];
    const pence = carryDiscount(
      {
        pence: r.discountPence,
        accommodationPence: r.accommodationPence,
        type: code?.discountType ?? null,
        percentOff: code?.percentOff != null ? Number(code.percentOff) : null,
        amountOffPence: code?.amountOffPence ?? null,
      },
      base.accommodationPence
    );
    const old = r.priceBreakdown.discount;
    discount = { id: r.discountCodeId, code: old?.code ?? "DISCOUNT", ...(old?.name ? { name: old.name } : {}), pence };
  }

  const newTotalPence = base.accommodationPence + base.cleaningFeePence + base.petFeePence + extrasPence - (discount?.pence ?? 0);
  const today = todayInZone(r.timezone, now);
  const plan = planMovePayment({
    oldTotalPence: r.totalPence,
    newTotalPence,
    paidPence,
    pendingBalance: pending ? { paymentId: pending.id, amountPence: pending.amountPence } : null,
    hasSavedCard: Boolean(card),
    balanceDueDate: addDays(checkIn, -r.balanceDueDaysBefore),
    today,
  });

  const oldVoucher = r.priceBreakdown.voucher ?? null;
  const voucherPence = Math.min(oldVoucher?.pence ?? 0, newTotalPence);
  const dueNowPence = Math.min(r.priceBreakdown.dueNowPence, newTotalPence - voucherPence);
  const quote: Quote = {
    currency: base.currency,
    checkIn,
    checkOut,
    nights: base.nights,
    accommodationPence: base.accommodationPence,
    cleaningFeePence: base.cleaningFeePence,
    petFeePence: base.petFeePence,
    extras,
    extrasPence,
    discount,
    totalPence: newTotalPence,
    voucher: oldVoucher ? { code: oldVoucher.code, pence: voucherPence } : null,
    dueNowPence,
    balancePence: plan.owedPence - plan.payNowPence,
    balanceDueDate: plan.balance.action === "UPDATE" || plan.balance.action === "CREATE" ? plan.balance.dueDate : null,
  };

  const oldNights = daysBetween(r.checkIn, r.checkOut);
  const hoursToArrival = (zonedTimeToUtc(r.checkIn, r.checkInTime, r.timezone).getTime() - now.getTime()) / 3_600_000;
  const warnings = [
    hoursToArrival < 48 ? (hoursToArrival < 0 ? "The original arrival date has passed." : "It's less than 48 hours before the original arrival.") : "",
    checkIn > addDays(r.checkIn, 365) ? "The new arrival is more than 12 months after the original one." : "",
    nights < oldNights ? `The new stay is shorter (${nights} nights instead of ${oldNights}).` : "",
    r.movedAt ? "This booking has been moved before. It keeps the cancellation terms from its first move (or its new dates', if stricter)." : "",
    checkIn < today ? "The new arrival date is in the past." : "",
    ...availability.reasons.filter((x) => x.code !== "DATES_TAKEN").map((x) => x.message),
  ].filter(Boolean);

  return {
    ok: true,
    preview: {
      reference: r.reference,
      from: { checkIn: r.checkIn, checkOut: r.checkOut, nights: oldNights },
      to: { checkIn, checkOut, nights },
      oldTotalPence: r.totalPence,
      newTotalPence,
      paidPence,
      quote,
      plan,
      warnings,
      lodgifyBookingId: r.lodgifyBookingId,
      newTerms: !isOnOldTerms(r.createdAt),
    },
    extras: bookedExtras,
    card,
    previous: r.priceBreakdown,
    propertyName: r.propertyName,
  };
}

/** What moving to these dates would mean, for the owner to approve. */
export async function previewMove(id: string, checkIn: string, checkOut: string, now = new Date()): Promise<MoveResult> {
  const found = await workOutMove(db(), id, checkIn, checkOut, now);
  return found.ok ? { ok: true, preview: found.preview } : { ok: false, error: found.error };
}

export async function moveBooking(
  admin: AdminUser,
  id: string,
  input: { checkIn: string; checkOut: string; reason: string; emailGuest: boolean; approvedTotalPence: number; approvedOwedPence: number },
  options: { gateway: PaymentGateway; paymentsReady: boolean; now?: Date }
): Promise<MoveResult> {
  const now = options.now ?? new Date();
  type Started = {
    preview: MovePreview;
    moveId: string;
    propertyId: string;
    topUp: { paymentId: string; customerId: string; paymentMethodId: string; description: string } | null;
  };
  let started: Started;
  try {
    const result = await db().begin(async (tx): Promise<{ ok: false; error: string } | ({ ok: true } & Started)> => {
      const [locked] = await tx<{ propertyId: string }[]>`SELECT property_id FROM reservations WHERE id = ${id}`;
      if (!locked) return { ok: false, error: "Booking not found." };
      await lockPropertyAvailability(tx, locked.propertyId);
      await tx`SELECT id FROM reservations WHERE id = ${id} FOR UPDATE`;

      const found = await workOutMove(tx, id, input.checkIn, input.checkOut, now);
      if (!found.ok) return found;
      const { preview, extras = [], card = null, previous, propertyName = "" } = found;
      const { plan, quote } = preview;

      // The owner approved one price: if it no longer holds, they decide again.
      if (preview.newTotalPence !== input.approvedTotalPence || plan.owedPence !== input.approvedOwedPence) {
        return { ok: false, error: "The price or payment has changed since you previewed it, so nothing has been done. Check the new figures and approve again." };
      }
      if (plan.payNowPence > 0 && !options.paymentsReady) {
        return { ok: false, error: "The difference can't be charged here because Stripe isn't set up, so nothing has been done." };
      }

      const total = quote.totalPence;
      await tx`
        UPDATE reservations SET
          check_in = ${quote.checkIn}, check_out = ${quote.checkOut},
          accommodation_pence = ${quote.accommodationPence}, cleaning_fee_pence = ${quote.cleaningFeePence},
          pet_fee_pence = ${quote.petFeePence}, extras_pence = ${quote.extrasPence}, discount_pence = ${quote.discount?.pence ?? 0},
          total_pence = ${total},
          deposit_pence = LEAST(deposit_pence, ${total}),
          voucher_pence = LEAST(voucher_pence, ${total} - LEAST(deposit_pence, ${total})),
          balance_due_date = ${quote.balanceDueDate},
          price_breakdown = ${tx.json(quote as unknown as Parameters<Tx["json"]>[0])},
          moved_at = COALESCE(moved_at, ${now}),
          arrival_when_moved = COALESCE(arrival_when_moved, ${preview.from.checkIn}::date),
          lodgify_mismatch_ignored = false, lodgify_checked_at = NULL
        WHERE id = ${id}
      `;
      for (const x of extras) {
        const repriced = quote.extras.find((q) => q.name === x.name && q.unitPricePence === x.unitPricePence && q.quantity === x.quantity);
        if (repriced) await tx`UPDATE reservation_extras SET total_pence = ${repriced.totalPence} WHERE id = ${x.id}`;
      }

      const b = plan.balance;
      if (b.action === "CANCEL") {
        await tx`UPDATE payments SET status = 'CANCELLED', cancelled_at = ${now} WHERE id = ${b.paymentId} AND status = 'PENDING'`;
      } else if (b.action === "UPDATE") {
        await tx`UPDATE payments SET amount_pence = ${b.amountPence}, due_date = ${b.dueDate} WHERE id = ${b.paymentId} AND status = 'PENDING'`;
      } else if (b.action === "CREATE") {
        await tx`
          INSERT INTO payments (reservation_id, provider, kind, status, amount_pence, currency, due_date, stripe_customer_id, stripe_payment_method_id)
          VALUES (${id}, 'STRIPE', 'BALANCE', 'PENDING', ${b.amountPence}, ${quote.currency}, ${b.dueDate}, ${card?.customerId ?? null}, ${card?.paymentMethodId ?? null})
        `;
      }

      // The extra cost of the new dates, charged once this has committed.
      let topUp: Started["topUp"] = null;
      if (plan.payNowPence > 0 && card) {
        const [p] = await tx<{ id: string }[]>`
          INSERT INTO payments (reservation_id, provider, kind, status, amount_pence, currency, due_date, stripe_customer_id, stripe_payment_method_id)
          VALUES (${id}, 'STRIPE', 'TOP_UP', 'PENDING', ${plan.payNowPence}, ${quote.currency}, ${todayInZone("Europe/London", now)}, ${card.customerId}, ${card.paymentMethodId})
          RETURNING id
        `;
        topUp = { paymentId: p.id, ...card, description: `${propertyName} date change to ${quote.checkIn}, ref ${preview.reference}` };
      }

      const [move] = await tx<{ id: string }[]>`
        INSERT INTO reservation_moves (reservation_id, moved_at, moved_by, reason, from_check_in, from_check_out, to_check_in, to_check_out,
          old_total_pence, new_total_pence, paid_pence, owed_pence, credit_pence, charged_automatically, email_guest, previous_price_breakdown)
        VALUES (${id}, ${now}, ${admin.email}, ${input.reason}, ${preview.from.checkIn}, ${preview.from.checkOut}, ${quote.checkIn}, ${quote.checkOut},
          ${preview.oldTotalPence}, ${total}, ${preview.paidPence}, ${plan.owedPence}, ${plan.creditPence}, ${plan.chargedAutomatically}, ${input.emailGuest},
          ${tx.json(previous as unknown as Parameters<Tx["json"]>[0])})
        RETURNING id
      `;

      await recordAudit(tx, {
        actorType: "ADMIN",
        actor: admin.email,
        action: "reservation.moved",
        entityType: "reservation",
        entityId: id,
        propertyId: locked.propertyId,
        details: {
          reference: preview.reference,
          reason: input.reason,
          from: preview.from,
          to: preview.to,
          oldTotalPence: preview.oldTotalPence,
          newTotalPence: total,
          owedPence: plan.owedPence,
          payNowPence: plan.payNowPence,
          creditPence: plan.creditPence,
          warnings: preview.warnings,
          emailedGuest: input.emailGuest,
        },
      });

      return { ok: true, preview, moveId: move.id, propertyId: locked.propertyId, topUp };
    });
    if (!result.ok) return result;
    started = result;
  } catch (error) {
    // The database's double-booking guard: someone took the dates meanwhile.
    if ((error as { code?: string }).code === "23P01") return { ok: false, error: "Those dates have just been taken, so nothing has been done." };
    throw error;
  }

  const { preview, moveId, propertyId, topUp } = started;
  const { plan } = preview;
  let chargedNowPence = 0;
  let chargeError: string | undefined;
  if (topUp) {
    let result: Awaited<ReturnType<PaymentGateway["chargeOffSession"]>>;
    try {
      result = await options.gateway.chargeOffSession({
        paymentId: topUp.paymentId,
        reservationId: id,
        reference: preview.reference,
        customerId: topUp.customerId,
        paymentMethodId: topUp.paymentMethodId,
        amountPence: plan.payNowPence,
        currency: preview.quote.currency,
        description: topUp.description,
      });
    } catch (error) {
      logError("Charging a move's difference failed", error);
      result = { ok: false, paymentIntentId: null, code: "error", message: String((error as Error)?.message ?? "The charge failed.") };
    }
    const succeeded = result.ok && result.status === "succeeded";
    if (succeeded) chargedNowPence = plan.payNowPence;
    else chargeError = result.ok ? `The payment is ${result.status}.` : result.message;
    await db().begin(async (tx) => {
      if (succeeded) {
        await tx`
          UPDATE payments SET status = 'SUCCEEDED', captured_at = now(), stripe_payment_intent_id = ${result.paymentIntentId}
          WHERE id = ${topUp.paymentId} AND status = 'PENDING'
        `;
      } else {
        await tx`
          UPDATE payments SET status = 'FAILED', failed_at = now(),
            stripe_payment_intent_id = COALESCE(${result.paymentIntentId}, stripe_payment_intent_id),
            failure_code = ${result.ok ? `status_${result.status}` : result.code}, failure_message = ${chargeError!.slice(0, 300)}
          WHERE id = ${topUp.paymentId} AND status = 'PENDING'
        `;
      }
      await recordAudit(tx, {
        actorType: "ADMIN",
        actor: admin.email,
        action: succeeded ? "payment.confirmed" : "payment.failed",
        entityType: "payment",
        entityId: topUp.paymentId,
        propertyId,
        details: { reference: preview.reference, kind: "TOP_UP", amountPence: plan.payNowPence, paymentIntentId: result.paymentIntentId, error: chargeError },
      });
    });
  }

  if (input.emailGuest) {
    const b = plan.balance;
    const balancePence = b.action === "UPDATE" || b.action === "CREATE" ? b.amountPence : 0;
    await db().begin((tx) =>
      enqueueBookingMovedEmail(tx, id, moveId, {
        fromCheckIn: preview.from.checkIn,
        fromCheckOut: preview.from.checkOut,
        oldTotalPence: preview.oldTotalPence,
        paidPence: preview.paidPence,
        chargedNowPence,
        failedNowPence: topUp && !chargedNowPence ? plan.payNowPence : 0,
        balancePence,
        chargeDate: plan.chargedAutomatically && (b.action === "UPDATE" || b.action === "CREATE") ? b.dueDate : null,
        creditPence: plan.creditPence,
        newTerms: preview.newTerms,
      })
    );
  }
  return { ok: true, preview, chargeError };
}

export type MoveRecord = {
  movedAt: Date;
  movedBy: string;
  reason: string;
  fromCheckIn: string;
  fromCheckOut: string;
  toCheckIn: string;
  toCheckOut: string;
  oldTotalPence: number;
  newTotalPence: number;
  owedPence: number;
  creditPence: number;
  chargedAutomatically: boolean;
};

export async function getMoves(id: string): Promise<MoveRecord[]> {
  return db()<MoveRecord[]>`
    SELECT moved_at, moved_by, reason, from_check_in::text, from_check_out::text, to_check_in::text, to_check_out::text,
           old_total_pence, new_total_pence, owed_pence, credit_pence, charged_automatically
    FROM reservation_moves WHERE reservation_id = ${id} ORDER BY moved_at
  `;
}
