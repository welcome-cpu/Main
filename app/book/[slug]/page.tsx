import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import AvailabilityCalendar, { type InitialStay } from "@/components/booking/AvailabilityCalendar";
import { runAfterResponse } from "@/lib/after-response";
import { directBookingProblem } from "@/lib/booking/feature";
import { getPublicCalendar, getPublicProperty } from "@/lib/booking/public";
import { syncStaleLodgifyFeeds } from "@/lib/calendar/sync";
import { addDays, todayInZone } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { loadExtras } from "@/lib/pricing/quote-service";
import { properties } from "@/lib/properties";

export const metadata: Metadata = {
  title: "Book direct",
  // Not for search engines while the new booking system is being tested.
  robots: { index: false, follow: false },
};

export default async function BookPage({ params, searchParams }: PageProps<"/book/[slug]">) {
  await connection();
  const problem = directBookingProblem();
  if (problem) {
    // Production simply doesn't have these pages; other deployments say why.
    if (process.env.VERCEL_ENV === "production") notFound();
    return (
      <div className="mx-auto max-w-lg px-4 py-24">
        <h1 className="text-2xl font-semibold text-foreground-strong">Direct booking is switched off here</h1>
        <p className="mt-2 text-muted-foreground">{problem}</p>
        <p className="mt-2 text-sm text-muted-foreground">Fix it in Vercel (Preview, branch dev), then redeploy.</p>
      </div>
    );
  }

  const { slug } = await params;
  const property = await getPublicProperty(slug);
  if (!property) notFound();
  // Keeps Lodgify's calendars fresh where the scheduled sync doesn't run.
  runAfterResponse(() => syncStaleLodgifyFeeds());

  const today = todayInZone(property.timezone);
  const from = `${today.slice(0, 7)}-01`;
  const to = addDays(today, property.bookingWindowDays + property.defaultMaxNights + property.turnoverNights + 31);
  // The identical chalet next door, shown alongside so a guest whose dates
  // are taken here can book it instead. Only once it's open for booking.
  const twinSlug = properties.find((p) => p.slug === property.slug)?.twinSlug;
  const twinProperty = twinSlug ? await getPublicProperty(twinSlug) : null;
  const [calendar, extras, twinCalendar] = await Promise.all([
    getPublicCalendar(property, { start: from, end: to }),
    loadExtras(db(), property.id),
    twinProperty?.isActive ? getPublicCalendar(twinProperty, { start: from, end: to }) : null,
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link href={`/properties/${property.slug}`} className="text-sm text-muted-foreground underline">
        ← {property.name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-foreground-strong">Book {property.name} direct</h1>
      <p className="mt-2 text-muted-foreground">
        Choose your dates and guests to see availability and the full price, then pay securely by card.
      </p>
      <div className="mt-8">
        <AvailabilityCalendar
          calendar={calendar}
          slug={property.slug}
          twin={twinCalendar ? { slug: twinCalendar.property.slug, calendar: twinCalendar } : null}
          initial={initialStay(await searchParams)}
          extras={extras.map(({ id, name, description, pricePence, pricingType, maxQuantity }) => ({
            id,
            name,
            description,
            pricePence,
            pricingType,
            maxQuantity,
          }))}
        />
      </div>
    </div>
  );
}

/** Dates and guests carried over from a search or the chalet next door. */
function initialStay(params: Record<string, string | string[] | undefined>): InitialStay | null {
  const date = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const count = (v: unknown) => (typeof v === "string" && /^\d{1,2}$/.test(v) ? Number(v) : undefined);
  const checkIn = date(params.checkIn);
  const checkOut = date(params.checkOut);
  if (!checkIn || !checkOut || checkOut <= checkIn) return null;
  return {
    checkIn,
    checkOut,
    adults: count(params.adults),
    children: count(params.children),
    infants: count(params.infants),
    pets: count(params.pets),
  };
}
