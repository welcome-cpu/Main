import "server-only";
import type { Sql, Tx } from "@/lib/db/client";
import { ownerMailbox } from "@/lib/email/graph";
import { isLodgifyPushEnabled } from "@/lib/booking/lodgify-push";
import { enqueueEmail } from "@/lib/email/outbox";
import {
  guestBalanceFailed,
  guestBalanceReceived,
  guestBookingCancelled,
  guestBookingConfirmed,
  guestNotCharged,
  guestPaymentReceipt,
  guestPrintReceipt,
  ownerNewBooking,
  ownerPaymentProblem,
  ownerPrintSold,
  printNeedsReplacing,
  type BookingEmailData,
  type PrintSaleEmailData,
} from "@/lib/email/templates";
import type { Quote } from "@/lib/pricing/quote";
import { SITE_URL } from "@/lib/site";

// Each function queues its emails inside the caller's transaction, keyed so
// that repeating the triggering event never sends them twice.

async function loadBookingEmailData(sql: Sql | Tx, reservationId: string): Promise<BookingEmailData | null> {
  const [row] = await sql<
    (Omit<BookingEmailData, "siteUrl" | "contactEmail" | "quote"> & { quote: Quote })[]
  >`
    SELECT r.reference, p.name AS property_name, r.check_in, r.check_out,
           to_char(p.check_in_time, 'HH24:MI') AS check_in_time,
           to_char(p.check_out_time, 'HH24:MI') AS check_out_time,
           r.adults, r.children, r.infants, r.pets,
           g.first_name AS guest_first_name, g.last_name AS guest_last_name,
           g.email AS guest_email, g.phone AS guest_phone, r.guest_message,
           r.price_breakdown AS quote
    FROM reservations r
    JOIN properties p ON p.id = r.property_id
    JOIN guests g ON g.id = r.guest_id
    WHERE r.id = ${reservationId}
  `;
  if (!row) return null;
  return { ...row, siteUrl: SITE_URL, contactEmail: ownerMailbox() || "welcome@gamriechalets.co.uk" };
}

export async function enqueueBookingConfirmedEmails(
  sql: Sql | Tx,
  reservationId: string,
  options: { resendKey?: string; guestOnly?: boolean } = {}
) {
  const d = await loadBookingEmailData(sql, reservationId);
  if (!d) return;
  // A resend gets its own key so it's sent again; the first send never repeats.
  const key = options.resendKey ? `booking-confirmed:${reservationId}:resend:${options.resendKey}` : `booking-confirmed:${reservationId}`;
  // With bookings going to Lodgify, Lodgify sends the confirmation and ours is the payment receipt.
  const email = isLodgifyPushEnabled() ? guestPaymentReceipt(d) : guestBookingConfirmed(d);
  await enqueueEmail(sql, { reservationId, kind: "BOOKING_CONFIRMED", dedupeKey: key, to: d.guestEmail, ...email });
  if (ownerMailbox() && !options.guestOnly) {
    await enqueueEmail(sql, {
      reservationId,
      kind: "OWNER_NEW_BOOKING",
      dedupeKey: `owner-new-booking:${reservationId}`,
      to: ownerMailbox(),
      replyTo: d.guestEmail,
      ...ownerNewBooking(d),
    });
  }
}

export async function enqueueNotChargedEmails(
  sql: Sql | Tx,
  reservationId: string,
  paymentId: string,
  reason: "DATES_UNAVAILABLE" | "PAYMENT_FAILED"
) {
  const d = await loadBookingEmailData(sql, reservationId);
  if (!d) return;
  await enqueueEmail(sql, { reservationId, kind: "NOT_CHARGED", dedupeKey: `not-charged:${paymentId}`, to: d.guestEmail, ...guestNotCharged(d, reason) });
  if (ownerMailbox()) {
    const problem =
      reason === "DATES_UNAVAILABLE"
        ? "Payment arrived after the hold ended and the dates were taken. The card authorisation was released; the guest wasn't charged."
        : "The deposit couldn't be captured, so the booking was cancelled and the dates freed. The guest wasn't charged.";
    await enqueueEmail(sql, {
      reservationId,
      kind: "OWNER_PAYMENT_PROBLEM",
      dedupeKey: `owner-not-charged:${paymentId}`,
      to: ownerMailbox(),
      replyTo: d.guestEmail,
      ...ownerPaymentProblem(d, problem),
    });
  }
}

export async function enqueueBalanceFailedEmails(sql: Sql | Tx, reservationId: string, paymentId: string, amountPence: number) {
  const d = await loadBookingEmailData(sql, reservationId);
  if (!d) return;
  await enqueueEmail(sql, { reservationId, kind: "BALANCE_FAILED", dedupeKey: `balance-failed:${paymentId}`, to: d.guestEmail, ...guestBalanceFailed(d, amountPence) });
  if (ownerMailbox()) {
    await enqueueEmail(sql, {
      reservationId,
      kind: "OWNER_PAYMENT_PROBLEM",
      dedupeKey: `owner-balance-failed:${paymentId}`,
      to: ownerMailbox(),
      replyTo: d.guestEmail,
      ...ownerPaymentProblem(d, "The automatic balance payment failed. The guest has been asked to get in touch to pay; the booking is still confirmed."),
    });
  }
}

export async function enqueueBalanceReceivedEmail(sql: Sql | Tx, reservationId: string, paymentId: string, amountPence: number) {
  const d = await loadBookingEmailData(sql, reservationId);
  if (!d) return;
  await enqueueEmail(sql, { reservationId, kind: "BALANCE_RECEIVED", dedupeKey: `balance-received:${paymentId}`, to: d.guestEmail, ...guestBalanceReceived(d, amountPence) });
}

export async function enqueueBookingCancelledEmail(sql: Sql | Tx, reservationId: string) {
  const d = await loadBookingEmailData(sql, reservationId);
  if (!d) return;
  await enqueueEmail(sql, { reservationId, kind: "BOOKING_CANCELLED", dedupeKey: `booking-cancelled:${reservationId}`, to: d.guestEmail, ...guestBookingCancelled(d) });
}

/** A print bought from a welcome guide: tell the owner where to post it, and thank the buyer. */
export async function enqueuePrintSoldEmails(
  sql: Sql | Tx,
  sessionId: string,
  d: Omit<PrintSaleEmailData, "contactEmail">,
  replaceNotify: string[] = []
) {
  const data = { ...d, contactEmail: ownerMailbox() || "welcome@gamriechalets.co.uk" };
  await enqueueEmail(sql, { reservationId: null, kind: "PRINT_RECEIPT", dedupeKey: `print-receipt:${sessionId}`, to: d.buyerEmail, ...guestPrintReceipt(data) });
  if (ownerMailbox()) {
    await enqueueEmail(sql, {
      reservationId: null,
      kind: "OWNER_PRINT_SOLD",
      dedupeKey: `owner-print-sold:${sessionId}`,
      to: ownerMailbox(),
      replyTo: d.buyerEmail,
      ...ownerPrintSold(data),
    });
  }
  for (const to of replaceNotify) {
    await enqueueEmail(sql, {
      reservationId: null,
      kind: "PRINT_REPLACE",
      dedupeKey: `print-replace:${sessionId}:${to.toLowerCase()}`,
      to,
      ...printNeedsReplacing(data),
    });
  }
}
