import "server-only";
import { recordAudit } from "@/lib/audit";
import { lockPropertyAvailability } from "@/lib/booking/locks";
import { db } from "@/lib/db/client";
import { enqueueBookingCancelledEmail, enqueueBookingConfirmedEmails } from "@/lib/email/booking-emails";
import type { AdminUser } from "@/lib/admin/users";
import { CHANNEL_FOR_SOURCE, channelLabel } from "@/lib/guests/lodgify-bookings";
import type { Quote } from "@/lib/pricing/quote";

export type BookingFilters = {
  propertyId: string | null;
  /** A booking source code, "EXTERNAL" for all imported calendars, or null for everything. */
  source: string | null;
  status: "CONFIRMED" | "HOLD" | "CANCELLED" | "EXPIRED" | "ALL";
  /** Stays overlapping [from, to); defaults to upcoming. */
  from: string | null;
  to: string | null;
};

export type BookingRow = {
  kind: "RESERVATION" | "EXTERNAL";
  id: string;
  reference: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  /** Given by direct guests; for Lodgify bookings, worked out from the phone number. */
  guestCountry: string | null;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  guests: string | null;
  source: string;
  sourceLabel: string;
  totalPence: number | null;
  paidPence: number | null;
  balancePence: number | null;
  paymentStatus: string | null;
  status: string;
};

/**
 * Bookings taken here plus (optionally) bookings imported from other
 * channels' calendars. Calendars carry no guest details; where a calendar
 * entry matches a booking copied from Lodgify, its guest name, country and
 * channel are shown.
 */
export async function listBookings(f: BookingFilters): Promise<BookingRow[]> {
  const sql = db();
  const from = f.from ?? new Date().toISOString().slice(0, 10);
  const to = f.to ?? "9999-12-31";
  const includeReservations = f.source === null || ["DIRECT", "MANUAL"].includes(f.source);
  const includeExternal =
    (f.source === null || f.source === "EXTERNAL" || !["DIRECT", "MANUAL"].includes(f.source)) &&
    (f.status === "ALL" || f.status === "CONFIRMED");

  const reservations = includeReservations
    ? await sql<BookingRow[]>`
        SELECT 'RESERVATION' AS kind, r.id, r.reference,
               CASE WHEN g.id IS NULL THEN NULL ELSE g.first_name || ' ' || g.last_name END AS guest_name,
               g.email AS guest_email, g.phone AS guest_phone, g.country AS guest_country,
               p.name AS property_name, r.check_in, r.check_out,
               r.adults || ' ad' || CASE WHEN r.children > 0 THEN ', ' || r.children || ' ch' ELSE '' END
                 || CASE WHEN r.infants > 0 THEN ', ' || r.infants || ' inf' ELSE '' END
                 || CASE WHEN r.pets > 0 THEN ', ' || r.pets || ' pet' ELSE '' END AS guests,
               r.source, s.label AS source_label,
               fin.total_pence, fin.paid_pence, fin.balance_pence, fin.payment_status,
               CASE WHEN r.status = 'HOLD' AND r.hold_expires_at <= now() THEN 'EXPIRED' ELSE r.status END AS status
        FROM reservations r
        JOIN properties p ON p.id = r.property_id
        JOIN booking_sources s ON s.code = r.source
        LEFT JOIN guests g ON g.id = r.guest_id
        JOIN reservation_financials fin ON fin.reservation_id = r.id
        WHERE r.stay && daterange(${from}::date, ${to}::date, '[)')
          ${f.propertyId ? sql`AND r.property_id = ${f.propertyId}` : sql``}
          ${f.source ? sql`AND r.source = ${f.source}` : sql``}
          ${f.status === "ALL" ? sql`` : f.status === "HOLD" ? sql`AND r.status = 'HOLD' AND r.hold_expires_at > now()` : f.status === "EXPIRED" ? sql`AND (r.status = 'EXPIRED' OR (r.status = 'HOLD' AND r.hold_expires_at <= now()))` : sql`AND r.status = ${f.status}`}
        ORDER BY r.check_in
        LIMIT 500
      `
    : [];

  // Airbnb and Booking.com bookings usually arrive through Lodgify's calendar,
  // so filtering by those channels also matches on the Lodgify copy.
  const channel = f.source ? (CHANNEL_FOR_SOURCE[f.source] ?? null) : null;
  const external = includeExternal
    ? await sql<(BookingRow & { channel: string | null })[]>`
        SELECT 'EXTERNAL' AS kind, e.id, NULL AS reference, COALESCE(lb.guest_name, e.summary) AS guest_name,
               NULL AS guest_email, NULL AS guest_phone, lb.country AS guest_country, p.name AS property_name,
               e.start_date AS check_in, e.end_date AS check_out,
               CASE WHEN lb.lodgify_booking_id IS NULL THEN NULL ELSE
                 lb.adults || ' ad' || CASE WHEN lb.children > 0 THEN ', ' || lb.children || ' ch' ELSE '' END
                   || CASE WHEN lb.infants > 0 THEN ', ' || lb.infants || ' inf' ELSE '' END
                   || CASE WHEN lb.pets > 0 THEN ', ' || lb.pets || ' pet' ELSE '' END
               END AS guests,
               f.source, s.label AS source_label, lb.channel,
               NULL AS total_pence, NULL AS paid_pence, NULL AS balance_pence, NULL AS payment_status,
               'CONFIRMED' AS status
        FROM external_events e
        JOIN calendar_feeds f ON f.id = e.feed_id AND f.is_active
        JOIN properties p ON p.id = e.property_id
        JOIN booking_sources s ON s.code = f.source
        LEFT JOIN LATERAL (
          SELECT * FROM lodgify_bookings b
          WHERE b.property_id = e.property_id AND b.arrival = e.start_date AND b.departure = e.end_date
            AND b.status = 'Booked'
          ORDER BY b.imported_at DESC
          LIMIT 1
        ) lb ON true
        WHERE e.status = 'ACTIVE' AND e.nights && daterange(${from}::date, ${to}::date, '[)')
          -- Our own bookings sent to Lodgify come back in its calendar: list them once.
          AND NOT EXISTS (
        SELECT 1 FROM reservations own
        WHERE own.property_id = e.property_id AND own.status = 'CONFIRMED'
          AND e.uid = 'lodgify-booking-' || own.lodgify_booking_id
      )
          ${f.propertyId ? sql`AND e.property_id = ${f.propertyId}` : sql``}
          ${f.source && f.source !== "EXTERNAL" ? (channel ? sql`AND (f.source = ${f.source} OR lb.channel = ${channel})` : sql`AND f.source = ${f.source}`) : sql``}
        ORDER BY e.start_date
        LIMIT 500
      `
    : [];

  const labelled: BookingRow[] = external.map(({ channel: ch, ...row }) =>
    ch ? { ...row, sourceLabel: `${channelLabel(ch)} (via Lodgify)` } : row
  );
  return [...reservations, ...labelled].sort((a, b) => (a.checkIn < b.checkIn ? -1 : a.checkIn > b.checkIn ? 1 : 0));
}

export type BookingDetail = {
  id: string;
  reference: string;
  status: string;
  source: string;
  sourceLabel: string;
  propertyId: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  guest: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    country: string | null;
    address: string | null;
  } | null;
  lodgifyBookingId: number | null;
  lodgifyPushStatus: string | null;
  lodgifyPushError: string | null;
  newsletterOptIn: boolean;
  newsletterStatus: string | null;
  guestMessage: string | null;
  quote: Quote | null;
  totalPence: number;
  paidPence: number;
  balancePence: number;
  paymentStatus: string;
  balanceDueDate: string | null;
  holdExpiresAt: Date | null;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  termsAcceptedAt: Date | null;
  createdAt: Date;
  payments: {
    id: string;
    provider: string;
    kind: string;
    status: string;
    amountPence: number;
    refundedPence: number;
    dueDate: string | null;
    stripePaymentIntentId: string | null;
    failureMessage: string | null;
    voucherCode: string | null;
    voucherReversedAt: Date | null;
    createdAt: Date;
  }[];
  emails: { kind: string; recipient: string; status: string; sentAt: Date | null; lastError: string | null; createdAt: Date }[];
  history: { occurredAt: Date; actorType: string; actor: string | null; action: string; details: Record<string, unknown> }[];
};

export async function getBooking(id: string): Promise<BookingDetail | null> {
  const sql = db();
  const [r] = await sql<(Omit<BookingDetail, "guest" | "payments" | "emails" | "history"> & {
    guestFirstName: string | null;
    guestLastName: string | null;
    guestEmail: string | null;
    guestPhone: string | null;
    guestCountry: string | null;
    guestAddress: string | null;
  })[]>`
    SELECT r.id, r.reference, r.status, r.source, s.label AS source_label, r.property_id, p.name AS property_name,
           r.check_in, r.check_out, r.adults, r.children, r.infants, r.pets, r.guest_message,
           r.price_breakdown AS quote, fin.total_pence, fin.paid_pence, fin.balance_pence, fin.payment_status,
           r.balance_due_date, r.hold_expires_at, r.confirmed_at, r.cancelled_at, r.cancellation_reason,
           r.terms_accepted_at, r.created_at,
           g.first_name AS guest_first_name, g.last_name AS guest_last_name, g.email AS guest_email, g.phone AS guest_phone,
           g.country AS guest_country,
           NULLIF(concat_ws(', ', g.address_line1, g.address_line2, g.city, g.postal_code), '') AS guest_address,
           r.lodgify_booking_id, r.lodgify_push_status, r.lodgify_push_error, r.newsletter_opt_in,
           (SELECT ns.status FROM newsletter_signups ns WHERE ns.reservation_id = r.id) AS newsletter_status
    FROM reservations r
    JOIN properties p ON p.id = r.property_id
    JOIN booking_sources s ON s.code = r.source
    JOIN reservation_financials fin ON fin.reservation_id = r.id
    LEFT JOIN guests g ON g.id = r.guest_id
    WHERE r.id = ${id}
  `;
  if (!r) return null;

  const [payments, emails, history] = await Promise.all([
    sql<BookingDetail["payments"]>`
      SELECT id, provider, kind, status, amount_pence, refunded_pence, due_date, stripe_payment_intent_id,
             failure_message, voucher_code, voucher_reversed_at, created_at
      FROM payments WHERE reservation_id = ${id} ORDER BY created_at
    `,
    sql<BookingDetail["emails"]>`
      SELECT kind, recipient, status, sent_at, last_error, created_at FROM emails
      WHERE reservation_id = ${id} ORDER BY created_at
    `,
    sql<BookingDetail["history"]>`
      SELECT occurred_at, actor_type, actor, action, details FROM audit_log
      WHERE entity_id = ${id}
         OR entity_id IN (SELECT id::text FROM payments WHERE reservation_id = ${id})
      ORDER BY occurred_at
    `,
  ]);

  const { guestFirstName, guestLastName, guestEmail, guestPhone, guestCountry, guestAddress, ...rest } = r;
  return {
    ...rest,
    quote: (rest.quote && Object.keys(rest.quote).length > 0 ? rest.quote : null) as Quote | null,
    guest: guestFirstName && guestLastName && guestEmail ? { firstName: guestFirstName, lastName: guestLastName, email: guestEmail, phone: guestPhone, country: guestCountry, address: guestAddress } : null,
    payments,
    emails,
    history,
  };
}

/**
 * Cancels a booking and frees its dates. Payments aren't refunded
 * automatically (bookings are non-refundable); refunds made in Stripe are
 * recorded when Stripe reports them. Any scheduled balance is called off.
 */
export async function cancelBooking(
  admin: AdminUser,
  id: string,
  input: { reason: string; emailGuest: boolean }
): Promise<{ error?: string }> {
  return db().begin(async (tx) => {
    const [r] = await tx<{ propertyId: string; status: string; reference: string }[]>`
      SELECT property_id, status, reference FROM reservations WHERE id = ${id}
    `;
    if (!r) return { error: "Booking not found." };
    await lockPropertyAvailability(tx, r.propertyId);

    const [updated] = await tx`
      UPDATE reservations SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = ${input.reason}
      WHERE id = ${id} AND status IN ('CONFIRMED', 'HOLD') RETURNING id
    `;
    if (!updated) return { error: "Only confirmed bookings or live holds can be cancelled." };

    await tx`
      UPDATE payments SET status = 'CANCELLED', cancelled_at = now()
      WHERE reservation_id = ${id} AND kind = 'BALANCE' AND status = 'PENDING'
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "reservation.cancelled",
      entityType: "reservation",
      entityId: id,
      propertyId: r.propertyId,
      details: { reference: r.reference, reason: input.reason, previousStatus: r.status, emailedGuest: input.emailGuest },
    });
    if (input.emailGuest && r.status === "CONFIRMED") await enqueueBookingCancelledEmail(tx, id);
    return {};
  });
}

export async function resendConfirmation(admin: AdminUser, id: string): Promise<{ error?: string }> {
  return db().begin(async (tx) => {
    const [r] = await tx<{ status: string; propertyId: string; reference: string }[]>`
      SELECT status, property_id, reference FROM reservations WHERE id = ${id}
    `;
    if (!r || r.status !== "CONFIRMED") return { error: "Only confirmed bookings have a confirmation to resend." };
    await enqueueBookingConfirmedEmails(tx, id, { resendKey: new Date().toISOString(), guestOnly: true });
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "email.confirmation_resent",
      entityType: "reservation",
      entityId: id,
      propertyId: r.propertyId,
      details: { reference: r.reference },
    });
    return {};
  });
}

/**
 * Records money received outside Stripe (e.g. bank transfer) against the
 * outstanding balance, and calls off any automatic balance charge.
 */
export async function recordManualPayment(
  admin: AdminUser,
  id: string,
  input: { amountPence: number; note: string }
): Promise<{ error?: string }> {
  return db().begin(async (tx) => {
    const [r] = await tx<{ propertyId: string; status: string; reference: string; currency: string; balancePence: number }[]>`
      SELECT r.property_id, r.status, r.reference, r.currency, fin.balance_pence
      FROM reservations r JOIN reservation_financials fin ON fin.reservation_id = r.id
      WHERE r.id = ${id} FOR UPDATE OF r
    `;
    if (!r || r.status !== "CONFIRMED") return { error: "Payments can only be recorded on confirmed bookings." };
    if (input.amountPence > r.balancePence) return { error: "That's more than the outstanding balance." };

    // The automatic charge for this balance must not also happen.
    await tx`
      UPDATE payments SET status = 'CANCELLED', cancelled_at = now()
      WHERE reservation_id = ${id} AND kind = 'BALANCE' AND status IN ('PENDING', 'FAILED')
    `;
    const [p] = await tx<{ id: string }[]>`
      INSERT INTO payments (reservation_id, provider, kind, status, amount_pence, currency, captured_at, failure_message)
      VALUES (${id}, 'MANUAL', 'BALANCE', 'SUCCEEDED', ${input.amountPence}, ${r.currency}, now(), ${input.note || null})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "payment.recorded_manually",
      entityType: "payment",
      entityId: p.id,
      propertyId: r.propertyId,
      details: { reservationId: id, reference: r.reference, amountPence: input.amountPence, note: input.note },
    });
    return {};
  });
}

/** Queues a fresh attempt at a balance whose automatic charge failed. */
export async function scheduleBalanceRetry(admin: AdminUser, id: string): Promise<{ paymentId?: string; error?: string }> {
  return db().begin(async (tx) => {
    const [failed] = await tx<{ amountPence: number; currency: string; customerId: string | null; paymentMethodId: string | null; propertyId: string; reference: string }[]>`
      SELECT pay.amount_pence, pay.currency, pay.stripe_customer_id AS customer_id,
             pay.stripe_payment_method_id AS payment_method_id, r.property_id, r.reference
      FROM payments pay JOIN reservations r ON r.id = pay.reservation_id
      WHERE pay.reservation_id = ${id} AND pay.kind = 'BALANCE' AND pay.status = 'FAILED' AND r.status = 'CONFIRMED'
        AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reservation_id = ${id} AND x.kind = 'BALANCE' AND x.status IN ('PENDING', 'SUCCEEDED'))
      ORDER BY pay.created_at DESC LIMIT 1
    `;
    if (!failed) return { error: "There's no failed balance payment to retry." };
    if (!failed.customerId || !failed.paymentMethodId) return { error: "No saved card is available for this booking." };

    const [p] = await tx<{ id: string }[]>`
      INSERT INTO payments (reservation_id, provider, kind, status, amount_pence, currency, due_date,
        stripe_customer_id, stripe_payment_method_id)
      VALUES (${id}, 'STRIPE', 'BALANCE', 'PENDING', ${failed.amountPence}, ${failed.currency},
        (now() AT TIME ZONE 'Europe/London')::date, ${failed.customerId}, ${failed.paymentMethodId})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "payment.balance_retry_scheduled",
      entityType: "payment",
      entityId: p.id,
      propertyId: failed.propertyId,
      details: { reservationId: id, reference: failed.reference },
    });
    return { paymentId: p.id };
  });
}

export type Attention = {
  failedPayments: { reservationId: string; reference: string; propertyName: string; checkIn: string; amountPence: number; message: string | null }[];
  failingFeeds: { name: string; propertyName: string; error: string | null; failures: number }[];
  failedEmails: { reservationId: string | null; reference: string | null; kind: string; recipient: string; error: string | null }[];
  /** Gift Up redemptions that may need sorting out by hand in Gift Up. */
  voucherProblems: { reservationId: string; reference: string; voucherCode: string; amountPence: number; message: string }[];
  /** Paid bookings that didn't get into Lodgify. */
  lodgifyProblems: { reservationId: string; reference: string; propertyName: string; checkIn: string; status: string; message: string | null }[];
};

/** Things the owner needs to deal with. */
export async function needsAttention(): Promise<Attention> {
  const sql = db();
  const [failedPayments, failingFeeds, failedEmails, voucherProblems, lodgifyProblems] = await Promise.all([
    sql<Attention["failedPayments"]>`
      SELECT r.id AS reservation_id, r.reference, p.name AS property_name, r.check_in,
             pay.amount_pence, pay.failure_message AS message
      FROM payments pay JOIN reservations r ON r.id = pay.reservation_id JOIN properties p ON p.id = r.property_id
      WHERE pay.kind = 'BALANCE' AND pay.status = 'FAILED' AND r.status = 'CONFIRMED'
        AND NOT EXISTS (SELECT 1 FROM payments x WHERE x.reservation_id = r.id AND x.kind = 'BALANCE' AND x.status IN ('PENDING', 'SUCCEEDED'))
      ORDER BY r.check_in
    `,
    sql<Attention["failingFeeds"]>`
      SELECT f.name, p.name AS property_name, f.last_error AS error, f.consecutive_failures AS failures
      FROM calendar_feeds f JOIN properties p ON p.id = f.property_id
      WHERE f.is_active AND f.last_status = 'ERROR'
    `,
    sql<Attention["failedEmails"]>`
      SELECT e.reservation_id, r.reference, e.kind, e.recipient, e.last_error AS error
      FROM emails e LEFT JOIN reservations r ON r.id = e.reservation_id
      WHERE e.status = 'FAILED' AND e.created_at > now() - interval '30 days'
      ORDER BY e.created_at DESC
    `,
    sql<Attention["voucherProblems"]>`
      SELECT r.id AS reservation_id, r.reference, pay.voucher_code, pay.amount_pence,
             CASE WHEN pay.status = 'FAILED'
               THEN 'Gift Up didn''t answer clearly, so the voucher may have been used. Check it in Gift Up and undo the redemption there if so.'
               ELSE 'The voucher couldn''t be given back automatically yet (' || COALESCE(pay.failure_message, 'retrying') || ').'
             END AS message
      FROM payments pay JOIN reservations r ON r.id = pay.reservation_id
      WHERE pay.kind = 'VOUCHER' AND pay.created_at > now() - interval '60 days'
        AND ((pay.status = 'FAILED' AND pay.failure_code = 'giftup_unknown')
          OR (pay.status = 'CANCELLED' AND pay.voucher_reversed_at IS NULL AND pay.failure_message IS NOT NULL))
      ORDER BY pay.created_at DESC
    `,
    sql<Attention["lodgifyProblems"]>`
      SELECT r.id AS reservation_id, r.reference, p.name AS property_name, r.check_in,
             r.lodgify_push_status AS status, r.lodgify_push_error AS message
      FROM reservations r JOIN properties p ON p.id = r.property_id
      WHERE r.status = 'CONFIRMED'
        AND (r.lodgify_push_status IN ('FAILED', 'CHECK')
          OR (r.lodgify_push_status = 'PUSHED' AND r.lodgify_push_error IS NOT NULL AND r.check_out >= current_date))
      ORDER BY r.check_in
    `,
  ]);
  return { failedPayments, failingFeeds, failedEmails, voucherProblems, lodgifyProblems };
}
