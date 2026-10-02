import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { processOutbox } from "@/lib/email/outbox";

export const maxDuration = 120;

/** Every 5 minutes: sends queued emails and retries failed ones. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await processOutbox({ limit: 50 }));
}
