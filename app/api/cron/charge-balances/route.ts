import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/after-response";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { processOutbox } from "@/lib/email/outbox";
import { chargeDueBalances } from "@/lib/payments/balance";
import { isPaymentConfigured, stripeGateway } from "@/lib/payments/gateway";

export const maxDuration = 120;

/** Daily: charges balances that have fallen due (saved card, off-session). */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured() || !isPaymentConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });

  const outcomes = await chargeDueBalances(stripeGateway);
  runAfterResponse(() => processOutbox());
  return NextResponse.json({ charged: outcomes.filter((o) => o.ok).length, failed: outcomes.filter((o) => !o.ok).length });
}
