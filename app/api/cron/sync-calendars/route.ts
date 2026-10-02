import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { syncAllFeeds } from "@/lib/calendar/sync";
import { isDatabaseConfigured } from "@/lib/db/client";

// Each feed has a 15-second fetch timeout; leave room for several feeds.
export const maxDuration = 120;

/**
 * Scheduled calendar sync, called by Vercel Cron (see vercel.json). Vercel
 * sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isDatabaseConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const outcomes = await syncAllFeeds("SCHEDULED");
  return NextResponse.json({
    synced: outcomes.length,
    failed: outcomes.filter((o) => !o.ok).length,
  });
}
