import "server-only";
import { pushPendingLodgifyBookings, queueLodgifyPush } from "@/lib/booking/lodgify-push";
import type { Sql, Tx } from "@/lib/db/client";
import { processNewsletterSignups, queueBookingNewsletterSignup } from "@/lib/newsletter/emailoctopus";

/**
 * What happens once a direct booking's first payment is taken, queued in the
 * same transaction as its confirmation emails: send it to Lodgify, and add
 * the guest to the mailing list if they asked.
 */
export async function queueAfterFirstPayment(sql: Sql | Tx, reservationId: string) {
  await queueLodgifyPush(sql, reservationId);
  await queueBookingNewsletterSignup(sql, reservationId);
}

/** Sends what queueAfterFirstPayment queued; the 5-minute job catches the rest. */
export async function sendQueuedAfterPayment() {
  await Promise.allSettled([pushPendingLodgifyBookings(3), processNewsletterSignups(5)]);
}
