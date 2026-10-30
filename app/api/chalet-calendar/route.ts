import { NextResponse } from "next/server";
import {
  addDays,
  fetchStayLimits,
  fetchUnavailableNights,
  isLodgifyConfigured,
} from "@/lib/lodgify";
import { properties } from "@/lib/properties";

const DAYS_AHEAD = 365;

export type ChaletCalendar = {
  slug: string;
  name: string;
  rentalId: string;
  unavailable: string[];
  minNightsByArrival: Record<string, number>;
  defaultMinNights: number;
};

export type ChaletCalendarResponse = {
  from: string;
  to: string;
  chalets: ChaletCalendar[];
};

/**
 * Night-by-night availability and minimum stays for a chalet and its twin,
 * so a guest whose dates are taken in one can book the other. Read from
 * Lodgify, which stays the source of truth; cached briefly at the edge.
 */
export async function GET(request: Request) {
  if (!isLodgifyConfigured()) {
    return NextResponse.json({ error: "Availability isn't configured." }, { status: 503 });
  }

  const slug = new URL(request.url).searchParams.get("slug");
  const property = properties.find((p) => p.slug === slug);
  const twin = property?.twinSlug ? properties.find((p) => p.slug === property.twinSlug) : undefined;
  if (!property || !twin) {
    return NextResponse.json({ error: "Unknown chalet." }, { status: 404 });
  }

  const from = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
  const to = addDays(from, DAYS_AHEAD);

  try {
    const chalets = await Promise.all(
      [property, twin].map(async (p): Promise<ChaletCalendar> => {
        const [unavailableFromLodgify, limits] = await Promise.all([
          fetchUnavailableNights(p.lodgifyRentalId!, from, to),
          fetchStayLimits(p.lodgifyRentalId!, p.lodgifyRoomTypeId!, from, to),
        ]);
        // Before its opening date a chalet is closed whatever Lodgify says.
        const closed: string[] = [];
        for (let night = from; p.bookableFrom && night < p.bookableFrom && night < to; night = addDays(night, 1)) {
          closed.push(night);
        }
        return {
          slug: p.slug,
          name: p.name,
          rentalId: p.lodgifyRentalId!,
          unavailable: [...new Set([...closed, ...unavailableFromLodgify])].sort(),
          ...limits,
        };
      })
    );

    return NextResponse.json(
      { from, to, chalets } satisfies ChaletCalendarResponse,
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
    );
  } catch (err) {
    console.error("Lodgify chalet calendar error", err);
    return NextResponse.json({ error: "Couldn't load availability." }, { status: 502 });
  }
}
