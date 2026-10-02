import { NextResponse } from "next/server";
import { exportFeedForToken } from "@/lib/calendar/exports";
import { isDatabaseConfigured } from "@/lib/db/client";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Our iCal export for other channels to import. The token is the only
 * credential, so unknown and revoked tokens look identical (404). Works
 * whether or not public booking is switched on, so channels can start
 * importing before go-live.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!isDatabaseConfigured()) return new NextResponse("Not found", { status: 404 });
  if (!(await rateLimit(`ical:${clientIp(request)}`, 60, 60))) {
    return new NextResponse("Too many requests", { status: 429 });
  }

  const token = (await params).token.replace(/\.ics$/, "");
  const ics = await exportFeedForToken(token);
  if (!ics) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="gamrie-chalets.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
