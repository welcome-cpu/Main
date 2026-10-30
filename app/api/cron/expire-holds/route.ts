import { NextResponse } from "next/server";
import { expireAllStaleHolds } from "@/lib/booking/holds";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { isDatabaseConfigured } from "@/lib/db/client";
import { reverseAbandonedVouchers } from "@/lib/vouchers/redemption";

/**
 * Tidies up lapsed checkout holds. Not needed for correctness — every
 * availability check already ignores holds past their expiry — but it keeps
 * statuses accurate for the admin area. Also gives gift vouchers back for
 * holds that didn't turn into bookings.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || !isDatabaseConfigured()) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isAuthorizedCronRequest(request)) return new NextResponse("Unauthorized", { status: 401 });

  const expired = await expireAllStaleHolds();
  return NextResponse.json({ expired, vouchers: await reverseAbandonedVouchers() });
}
