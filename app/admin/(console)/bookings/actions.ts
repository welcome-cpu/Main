"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/app/admin/(console)/actions";
import { runAfterResponse } from "@/lib/after-response";
import {
  recordManualPayment,
  resendConfirmation,
  scheduleBalanceRetry,
} from "@/lib/admin/bookings";
import { cancelBookingWithRefund, retryCancellationRefund } from "@/lib/admin/cancellations";
import { requireAdmin } from "@/lib/admin/dal";
import { moveBooking } from "@/lib/admin/moves";
import { isUuid } from "@/lib/admin/properties";
import { cancelWithRefundSchema, fieldErrors, manualPaymentSchema, moveBookingSchema } from "@/lib/admin/validation";
import { cancelBookingInLodgify } from "@/lib/booking/lodgify-cancel";
import { keepDespiteLodgify } from "@/lib/booking/lodgify-check";
import { isLodgifyPushEnabled, pushReservationToLodgify, resolveLodgifyPush } from "@/lib/booking/lodgify-push";
import { processOutbox } from "@/lib/email/outbox";
import { importLodgifyBookings } from "@/lib/guests/lodgify-import";
import { formatPence } from "@/lib/money";
import { chargeDueBalances } from "@/lib/payments/balance";
import { isPaymentConfigured, stripeGateway } from "@/lib/payments/gateway";

const page = (id: string) => `/admin/bookings/${id}`;

function done(id: string, message: string): FormState {
  revalidatePath(page(id));
  revalidatePath("/admin/bookings");
  // Send any emails the action queued.
  runAfterResponse(() => processOutbox({ limit: 10 }));
  return { ok: true, message };
}

export async function cancelWithRefundAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const parsed = cancelWithRefundSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await cancelBookingWithRefund(admin, id, parsed.data, { gateway: stripeGateway, paymentsReady: isPaymentConfigured() });
  if (result.error) {
    revalidatePath(page(id));
    return { message: result.error };
  }
  const { preview, refundError } = result;
  if (refundError) {
    revalidatePath(page(id));
    return { message: `Booking cancelled and dates released, but the refund failed: ${refundError} Retry it on this page.` };
  }
  const left = [
    preview?.voucherPence ? `give ${formatPence(preview.voucherPence)} back on voucher ${preview.voucherCode ?? ""} in Gift Up` : "",
    preview?.manualPence ? `return ${formatPence(preview.manualPence)} paid outside Stripe` : "",
  ].filter(Boolean);
  return done(id, `Booking cancelled and dates released. ${preview?.cardPence ? `${formatPence(preview.cardPence)} refunded to the card.` : "No card refund."}${left.length ? ` Still to do by hand: ${left.join("; ")}.` : ""}`);
}

export async function moveBookingAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const parsed = moveBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };
  const result = await moveBooking(admin, id, parsed.data, { gateway: stripeGateway, paymentsReady: isPaymentConfigured() });
  if (!result.ok) {
    revalidatePath(page(id));
    return { message: result.error };
  }
  done(id, "Booking moved.");
  redirect(`${page(id)}?moved=1${result.chargeError ? "&chargeFailed=1" : ""}#move`);
}

export async function retryCancellationRefundAction(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  if (!isPaymentConfigured()) return { message: "Card refunds can't be made here because Stripe isn't set up." };
  const result = await retryCancellationRefund(admin, id, stripeGateway);
  revalidatePath(page(id));
  if (result.error) return { message: result.error };
  return done(id, "Refund made.");
}

export async function retryLodgifyCancelAction(id: string): Promise<FormState> {
  await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const outcome = await cancelBookingInLodgify(id);
  revalidatePath(page(id));
  return outcome === "DONE" ? { ok: true, message: "Released in Lodgify." } : { message: "Lodgify didn't confirm it. See the note on this page." };
}

export async function resendConfirmationAction(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const result = await resendConfirmation(admin, id);
  if (result.error) return { message: result.error };
  return done(id, "Confirmation email queued.");
}

export async function recordPaymentAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const parsed = manualPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await recordManualPayment(admin, id, parsed.data);
  if (result.error) return { message: result.error };
  return done(id, "Payment recorded.");
}

export async function retryBalanceAction(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  if (!isPaymentConfigured()) return { message: "Stripe isn't configured on this site." };

  const scheduled = await scheduleBalanceRetry(admin, id);
  if (!scheduled.paymentId) return { message: scheduled.error ?? "Couldn't retry." };
  const [outcome] = await chargeDueBalances(stripeGateway, new Date(), scheduled.paymentId);
  if (!outcome) return { message: "Couldn't retry." };
  if (!outcome.ok && outcome.message) return { message: outcome.message };
  return done(id, outcome.ok ? "Balance charged successfully." : "The card was declined again. The guest has been emailed.");
}

export async function retryLodgifyPushAction(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  if (!isLodgifyPushEnabled()) return { message: "Sending bookings to Lodgify is switched off on this site." };
  if (!(await resolveLodgifyPush(id, admin.email, { retry: true }))) return { message: "This booking can't be sent again." };
  const outcome = await pushReservationToLodgify(id);
  return done(id, outcome === "PUSHED" ? "Booking created in Lodgify." : "Lodgify didn't take it: see the message below.");
}

export async function keepDespiteLodgifyAction(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  if (!(await keepDespiteLodgify(id, admin.email))) return { message: "Nothing to keep." };
  return done(id, "Kept. The balance will be charged as normal.");
}

export async function linkLodgifyBookingAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const lodgifyBookingId = Number(String(formData.get("lodgifyBookingId") ?? "").trim());
  if (!Number.isSafeInteger(lodgifyBookingId) || lodgifyBookingId <= 0) {
    return { errors: { lodgifyBookingId: ["Enter the booking number from Lodgify."] } };
  }
  try {
    if (!(await resolveLodgifyPush(id, admin.email, { lodgifyBookingId }))) return { message: "This booking can't be linked." };
  } catch (error) {
    if ((error as { code?: string }).code === "23505") return { message: "Another booking is already linked to that Lodgify booking." };
    throw error;
  }
  return done(id, "Linked to the Lodgify booking.");
}

export async function importLodgifyBookingsAction(): Promise<FormState> {
  const admin = await requireAdmin();
  const outcome = await importLodgifyBookings("MANUAL", admin.email);
  revalidatePath("/admin/bookings");
  return outcome.ok
    ? { ok: true, message: `Imported ${outcome.imported} bookings from Lodgify.` }
    : { message: `Import failed: ${outcome.error}` };
}
