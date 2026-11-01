import { NextResponse } from "next/server";
import { checkLodgifyBookings } from "@/lib/booking/lodgify-check";
import { pushPendingLodgifyBookings } from "@/lib/booking/lodgify-push";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { processNewsletterSignups } from "@/lib/newsletter/emailoctopus";

export const maxDuration = 120;

/**
 * Every 5 minutes: sends paid direct bookings on to Lodgify and mailing list
 * sign-ups to EmailOctopus. Both are normally sent straight after payment;
 * this catches anything that didn't go then. Also compares a few upcoming
 * bookings with Lodgify, to spot ones cancelled or changed there.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });
  const [lodgify, newsletter] = await Promise.all([pushPendingLodgifyBookings(), processNewsletterSignups()]);
  const checks = await checkLodgifyBookings();
  return NextResponse.json({ lodgify, newsletter, checks });
}
