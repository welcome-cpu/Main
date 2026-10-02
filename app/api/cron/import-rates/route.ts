import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { importAllLodgifyRates } from "@/lib/pricing/lodgify-import";

export const maxDuration = 120;

/** Daily copy of nightly prices from Lodgify, called by Vercel Cron. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });

  const outcomes = await importAllLodgifyRates("SCHEDULED");
  return NextResponse.json({
    imported: outcomes.length,
    failed: outcomes.filter((o) => !o.ok).length,
  });
}
