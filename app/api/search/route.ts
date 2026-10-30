import { NextResponse } from "next/server";
import { isDirectBookingEnabled } from "@/lib/booking/feature";
import { searchPublicProperties } from "@/lib/booking/public";
import { isLodgifyConfigured, isRangeAvailable } from "@/lib/lodgify";
import { bookableProperties } from "@/lib/properties";

export async function GET(request: Request) {
  // Where direct booking is on (the dev site), search our own calendars and
  // send guests to our booking pages; elsewhere, Lodgify as before.
  if (isDirectBookingEnabled()) return searchDirect(request);
  if (!isLodgifyConfigured()) {
    return NextResponse.json(
      { error: "Search is not configured yet." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const guests = Number(searchParams.get("guests") ?? "1");

  if (!start || !end || new Date(start) >= new Date(end)) {
    return NextResponse.json(
      { error: "Provide a valid start and end date." },
      { status: 400 }
    );
  }

  try {
    const results = await Promise.all(
      bookableProperties
        .filter((property) => property.lodgifyRentalId)
        .map(async (property) => {
          const fitsGuests = guests <= property.sleeps;
          // Not open yet for stays starting before its opening date.
          const isOpen = !property.bookableFrom || start >= property.bookableFrom;
          const available =
            fitsGuests &&
            isOpen &&
            (await isRangeAvailable(property.lodgifyRentalId!, start, end));
          return {
            slug: property.slug,
            name: property.name,
            sleeps: property.sleeps,
            available,
          };
        })
    );

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Lodgify search error", err);
    return NextResponse.json(
      { error: "Failed to search availability." },
      { status: 502 }
    );
  }
}

async function searchDirect(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start") ?? "";
  const end = searchParams.get("end") ?? "";
  const guests = Number(searchParams.get("guests") ?? "1");
  const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!isDate(start) || !isDate(end) || start >= end || !Number.isInteger(guests) || guests < 1 || guests > 20) {
    return NextResponse.json({ error: "Provide a valid start and end date." }, { status: 400 });
  }

  try {
    const checks = await searchPublicProperties({ checkIn: start, checkOut: end, adults: guests, children: 0, infants: 0, pets: 0 });
    const results = bookableProperties.flatMap((property) => {
      const check = checks.find((c) => c.slug === property.slug);
      if (!check) return [];
      const query = new URLSearchParams({ checkIn: start, checkOut: end, adults: String(guests) });
      return [
        {
          slug: property.slug,
          name: property.name,
          sleeps: property.sleeps,
          available: check.available,
          bookUrl: `/book/${property.slug}?${query}`,
        },
      ];
    });
    return NextResponse.json({ results });
  } catch (err) {
    console.error("Direct booking search error", err);
    return NextResponse.json({ error: "Failed to search availability." }, { status: 502 });
  }
}
