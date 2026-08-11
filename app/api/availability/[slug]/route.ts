import { NextResponse } from "next/server";
import {
  fetchAvailability,
  isLodgifyConfigured,
  normalizeAvailability,
} from "@/lib/lodgify";
import { properties } from "@/lib/properties";

const VALID_SLUGS = properties.map((p) => p.slug);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!VALID_SLUGS.includes(slug)) {
    return NextResponse.json({ error: "Unknown property." }, { status: 404 });
  }

  if (!isLodgifyConfigured(slug)) {
    return NextResponse.json(
      { error: "Availability is not configured yet." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const today = new Date();
  const defaultStart = today.toISOString().slice(0, 10);
  const defaultEndDate = new Date(today);
  defaultEndDate.setMonth(defaultEndDate.getMonth() + 2);

  const start = searchParams.get("start") ?? defaultStart;
  const end = searchParams.get("end") ?? defaultEndDate.toISOString().slice(0, 10);

  try {
    const raw = await fetchAvailability(slug, start, end);
    return NextResponse.json({ periods: normalizeAvailability(raw) });
  } catch (err) {
    console.error("Lodgify availability error", err);
    return NextResponse.json(
      { error: "Failed to load availability." },
      { status: 502 }
    );
  }
}
