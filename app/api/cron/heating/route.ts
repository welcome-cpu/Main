import { NextResponse } from "next/server";
import { runAfterResponse } from "@/lib/after-response";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { processOutbox } from "@/lib/email/outbox";
import { isHiveConfigured } from "@/lib/heating/hive";
import { runHeating } from "@/lib/heating/run";

export const maxDuration = 120;

/** Hourly: puts the heating schedule back before each guest and turns it off when the cottage sits empty. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured() || !isHiveConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });

  const outcomes = await runHeating({ trigger: "SCHEDULED" });
  runAfterResponse(() => processOutbox());
  return NextResponse.json({ outcomes: outcomes.map((o) => ({ result: o.result, key: "key" in o ? o.key : undefined })) });
}
