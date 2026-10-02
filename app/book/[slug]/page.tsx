import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import AvailabilityCalendar from "@/components/booking/AvailabilityCalendar";
import { directBookingProblem } from "@/lib/booking/feature";
import { getPublicCalendar, getPublicProperty } from "@/lib/booking/public";
import { addDays, todayInZone } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { loadExtras } from "@/lib/pricing/quote-service";

export const metadata: Metadata = {
  title: "Book direct",
  // Not for search engines while the new booking system is being tested.
  robots: { index: false, follow: false },
};

export default async function BookPage({ params }: PageProps<"/book/[slug]">) {
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

  const today = todayInZone(property.timezone);
  const from = `${today.slice(0, 7)}-01`;
  const to = addDays(today, property.bookingWindowDays + property.defaultMaxNights + property.turnoverNights + 31);
  const [calendar, extras] = await Promise.all([
    getPublicCalendar(property, { start: from, end: to }),
    loadExtras(db(), property.id),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link href={`/properties/${property.slug}`} className="text-sm text-muted-foreground underline">
        ← {property.name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-foreground-strong">Book {property.name} direct</h1>
      <p className="mt-2 text-muted-foreground">
        Choose your dates and guests to see availability and the full price. Online payment is coming next.
      </p>
      <div className="mt-8">
        <AvailabilityCalendar
          calendar={calendar}
          slug={property.slug}
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
