import { NextResponse } from "next/server";
import { isLodgifyConfigured, isRangeAvailable } from "@/lib/lodgify";
import { bookableProperties } from "@/lib/properties";

export async function GET(request: Request) {
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
          const available =
            fitsGuests &&
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
