import { runAfterResponse } from "@/lib/after-response";
import { guardPublicRequest, json } from "@/lib/booking/api";
import { loadBookingSetup } from "@/lib/booking/setup";
import { syncStaleLodgifyFeeds } from "@/lib/calendar/sync";
import { importStaleLodgifyRates } from "@/lib/pricing/lodgify-import";

/**
 * Calendars and extras for the booking widget on a property page: the
 * property, then its twin chalet if it has one. Public data only: which
 * nights are free, never who booked them.
 */
export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const blocked = await guardPublicRequest(request, "booking-setup", 60);
  if (blocked) return blocked;

  const chalets = await loadBookingSetup((await params).slug);
  if (!chalets) return json({ error: "Not found" }, 404);
  // Keeps Lodgify's calendars and prices fresh where the scheduled jobs don't run.
  runAfterResponse(() => Promise.all([syncStaleLodgifyFeeds(), importStaleLodgifyRates()]));
  return json({ chalets });
}
