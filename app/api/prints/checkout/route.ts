import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/db/client";
import { logError } from "@/lib/log";
import { createPrintCheckout, isPaymentConfigured } from "@/lib/payments/gateway";
import { findPrint } from "@/lib/prints";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * The "Buy this print" button on a welcome guide posts here; we send the
 * guest on to Stripe's checkout. A plain form post, so it works without JS.
 */
export async function POST(request: Request) {
  if (!isDatabaseConfigured() || !isPaymentConfigured()) return new NextResponse("Not available", { status: 404 });

  const form = await request.formData().catch(() => null);
  const print = findPrint(String(form?.get("print") ?? ""));
  if (!print) return new NextResponse("Unknown print", { status: 400 });

  if (!(await rateLimit(`print-checkout:${clientIp(request)}`, 10, 3600))) {
    return new NextResponse("Too many attempts. Please try again later.", { status: 429 });
  }

  // Back to the same site (live or a preview) the guest came from.
  const origin = new URL(request.url).origin;
  const guide = `${origin}/welcome/${print.guideSlug}`;
  try {
    const url = await createPrintCheckout({
      printSlug: print.slug,
      name: `${print.title} by ${print.artist} (framed ${print.medium}, from the wall in ${print.chaletName})`,
      amountPence: print.pricePence,
      imageUrl: `${origin}${print.image.src}`,
      successUrl: `${guide}?print=thanks#art`,
      cancelUrl: `${guide}#art`,
    });
    return NextResponse.redirect(url, 303);
  } catch (error) {
    logError(`Print checkout for ${print.slug} failed`, error);
    return new NextResponse("Sorry, we couldn't start the payment. Please try again or contact us.", { status: 502 });
  }
}
