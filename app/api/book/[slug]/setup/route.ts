import { runAfterResponse } from "@/lib/after-response";
import { guardPublicRequest, json } from "@/lib/booking/api";
import { loadBookingSetup } from "@/lib/booking/setup";
import { syncStaleLodgifyFeeds } from "@/lib/calendar/sync";

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
  // Keeps Lodgify's calendars fresh where the scheduled sync doesn't run.
  runAfterResponse(() => syncStaleLodgifyFeeds());
  return json({ chalets });
}
