import { runAfterResponse } from "@/lib/after-response";
import { sendQueuedAfterPayment } from "@/lib/booking/after-payment";
import { guardPublicRequest, json, readJsonBody, validationError } from "@/lib/booking/api";
import { createHold, GUEST_FACING_HOLD_MINUTES, HOLD_MINUTES } from "@/lib/booking/holds";
import { getPublicProperty } from "@/lib/booking/public";
import { holdBodySchema } from "@/lib/booking/public-validation";
import { startCheckout } from "@/lib/payments/checkout";
import { isPaymentConfigured, paymentConfigProblem, stripeGateway } from "@/lib/payments/gateway";
import { clientIp } from "@/lib/rate-limit";
import { passesTurnstile } from "@/lib/turnstile";
import { lookupVoucher } from "@/lib/vouchers/giftup";
import {
  confirmVoucherOnlyBooking,
  redeemHoldVoucher,
  releaseHoldAndVoucher,
  reverseAbandonedVouchers,
} from "@/lib/vouchers/redemption";

/**
 * Starts checkout: holds the dates for 30 minutes while the guest pays.
 * Availability and price are worked out again here, under a lock; nothing
 * the browser says about price is used.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  // Holds take dates off sale, so they're limited much more tightly than
  // quotes: 5 per IP per 10 minutes, plus a Turnstile check.
  const blocked = await guardPublicRequest(request, "hold", 5, 600);
  if (blocked) return blocked;

  const read = await readJsonBody(request);
  if (!read.ok) return read.response;
  const parsed = holdBodySchema.safeParse(read.body);
  if (!parsed.success) return validationError(parsed.error);

  const ip = clientIp(request);
  if (!(await passesTurnstile(parsed.data.turnstileToken, ip))) {
    return json({ error: "Please complete the verification check and try again." }, 400);
  }

  const property = await getPublicProperty((await params).slug);
  if (!property) return json({ error: "Not found" }, 404);

  // Don't take dates off sale if payment is misconfigured (e.g. a live
  // Stripe key on a test site).
  if (paymentConfigProblem() === "LIVE_KEY_OUTSIDE_PRODUCTION") {
    console.error("Refusing checkout: live Stripe key on a non-production deployment");
    return json({ error: "Online payment is unavailable on this site at the moment." }, 503);
  }

  const { stay: { voucherCode, ...stay }, guest } = parsed.data;
  // Gift vouchers are checked with Gift Up here; the browser's view of the
  // balance is never used.
  const voucher = voucherCode ? await lookupVoucher(voucherCode) : null;
  if (voucher && !voucher.ok) return json({ error: voucher.message }, 409);

  const result = await createHold(
    property.id,
    { ...stay, discountCode: stay.discountCode ?? null, voucher },
    { ...guest, email: guest.email.toLowerCase() },
    { ip }
  );

  if (!result.ok) {
    return json(
      {
        error: result.quoteError?.message ?? result.reasons[0]?.message ?? "Those dates can't be booked.",
        reasons: result.reasons.map(({ code, message }) => ({ code, message })),
      },
      409
    );
  }

  // Tidy up vouchers from holds that didn't go ahead (also a scheduled job).
  runAfterResponse(() => reverseAbandonedVouchers());

  const origin = new URL(request.url).origin;
  let checkoutUrl: string | null = null;
  if (result.quote.voucher) {
    const redeemed = await redeemHoldVoucher(result);
    if (!redeemed.ok) return json({ error: redeemed.message }, 409);
  }

  if (result.quote.voucher && result.quote.dueNowPence === 0) {
    // Paid in full by the voucher: confirmed now, no card needed.
    if (!(await confirmVoucherOnlyBooking(result.reservationId))) {
      await releaseHoldAndVoucher(result.reservationId, "Voucher-only booking could not be confirmed");
      return json({ error: "We couldn't confirm your booking. Your gift voucher hasn't been used; please try again." }, 409);
    }
    runAfterResponse(() => sendQueuedAfterPayment());
    checkoutUrl = `${origin}/book/${property.slug}/confirmation?reservation=${result.reservationId}`;
  } else if (isPaymentConfigured()) {
    // Send the guest straight to Stripe's payment page. Without Stripe
    // configured (local development) the hold is returned on its own.
    const checkout = await startCheckout(stripeGateway, result, {
      propertyName: property.name,
      guestEmail: guest.email.toLowerCase(),
      origin,
      slug: property.slug,
    });
    if (!checkout.ok) return json({ error: checkout.message }, 502);
    checkoutUrl = checkout.url;
  }

  return json(
    {
      checkoutUrl,
      reservationId: result.reservationId,
      reference: result.reference,
      accessToken: result.accessToken,
      payBy: new Date(result.expiresAt.getTime() - (HOLD_MINUTES - GUEST_FACING_HOLD_MINUTES) * 60_000).toISOString(),
      quote: result.quote,
    },
    201
  );
}
