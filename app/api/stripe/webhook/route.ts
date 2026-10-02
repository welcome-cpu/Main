import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/after-response";
import { isDatabaseConfigured } from "@/lib/db/client";
import { processOutbox } from "@/lib/email/outbox";
import { stripeGateway } from "@/lib/payments/gateway";
import { handleStripeEvent } from "@/lib/payments/webhook";

/**
 * Stripe webhook endpoint. The signature is verified against the raw body
 * before anything is trusted; duplicate deliveries are no-ops.
 */
export async function POST(request: Request) {
  if (!process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY || !isDatabaseConfigured()) {
    return new NextResponse("Not configured", { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new NextResponse("Missing signature", { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = stripeGateway.parseWebhook(payload, signature);
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  try {
    const outcome = await handleStripeEvent(event, stripeGateway);
    // Send any emails this caused once Stripe has its answer; the 5-minute
    // job retries anything that fails.
    runAfterResponse(() => processOutbox({ limit: 10 }));
    return NextResponse.json({ received: true, ...outcome });
  } catch (error) {
    console.error(`Stripe webhook ${event.type} (${event.id}) failed`, error);
    return new NextResponse("Processing failed", { status: 500 });
  }
}
