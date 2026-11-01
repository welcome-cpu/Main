"use server";

import { revalidatePath } from "next/cache";
import type { FormState } from "@/app/admin/(console)/actions";
import { runAfterResponse } from "@/lib/after-response";
import {
  cancelBooking,
  recordManualPayment,
  resendConfirmation,
  scheduleBalanceRetry,
} from "@/lib/admin/bookings";
import { requireAdmin } from "@/lib/admin/dal";
import { isUuid } from "@/lib/admin/properties";
import { cancelBookingSchema, fieldErrors, manualPaymentSchema } from "@/lib/admin/validation";
import { isLodgifyPushEnabled, pushReservationToLodgify, resolveLodgifyPush } from "@/lib/booking/lodgify-push";
import { processOutbox } from "@/lib/email/outbox";
import { importLodgifyBookings } from "@/lib/guests/lodgify-import";
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

export async function cancelBookingAction(id: string, _: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  const parsed = cancelBookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const result = await cancelBooking(admin, id, parsed.data);
  if (result.error) return { message: result.error };
  return done(id, "Booking cancelled and dates released. Any refund must be made in Stripe.");
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
  return done(id, outcome?.ok ? "Balance charged successfully." : "The card was declined again. The guest has been emailed.");
}

export async function retryLodgifyPushAction(id: string): Promise<FormState> {
  const admin = await requireAdmin();
  if (!isUuid(id)) return { message: "Unknown booking." };
  if (!isLodgifyPushEnabled()) return { message: "Sending bookings to Lodgify is switched off on this site." };
  if (!(await resolveLodgifyPush(id, admin.email, { retry: true }))) return { message: "This booking can't be sent again." };
  const outcome = await pushReservationToLodgify(id);
  return done(id, outcome === "PUSHED" ? "Booking created in Lodgify." : "Lodgify didn't take it: see the message below.");
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
