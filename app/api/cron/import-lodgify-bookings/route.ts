import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { importLodgifyBookings } from "@/lib/guests/lodgify-import";

export const maxDuration = 120;

/** Daily copy of guest names and countries from Lodgify, called by Vercel Cron. */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });

  const outcome = await importLodgifyBookings("SCHEDULED");
  return NextResponse.json({ ok: outcome.ok, imported: outcome.imported });
}
