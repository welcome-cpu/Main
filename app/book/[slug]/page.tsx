import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import AvailabilityCalendar, { type InitialStay } from "@/components/booking/AvailabilityCalendar";
import { runAfterResponse } from "@/lib/after-response";
import { directBookingProblem } from "@/lib/booking/feature";
import { loadBookingSetup } from "@/lib/booking/setup";
import { syncStaleLodgifyFeeds } from "@/lib/calendar/sync";
import { importStaleLodgifyRates } from "@/lib/pricing/lodgify-import";

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
  const chalets = await loadBookingSetup(slug);
  if (!chalets) notFound();
  const name = chalets[0].calendar.property.name;
  // Keeps Lodgify's calendars and prices fresh where the scheduled jobs don't run.
  runAfterResponse(() => Promise.all([syncStaleLodgifyFeeds(), importStaleLodgifyRates()]));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <Link href={`/properties/${slug}`} className="text-sm text-muted-foreground underline">
        ← {name}
      </Link>
      <h1 className="mt-2 text-3xl font-semibold text-foreground-strong">Book {name} direct</h1>
      <p className="mt-2 text-muted-foreground">
        Choose your dates and guests to see availability and the full price, then pay securely by card.
      </p>
      <div className="mt-8">
        <AvailabilityCalendar chalets={chalets} initial={initialStay(await searchParams)} />
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
