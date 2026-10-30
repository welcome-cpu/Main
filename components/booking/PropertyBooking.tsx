"use client";

import { useEffect, useState } from "react";
import AvailabilityCalendar from "@/components/booking/AvailabilityCalendar";
import type { ChaletSetup } from "@/lib/booking/setup";

/**
 * The booking widget on a property page. Property pages are built ahead of
 * time, so live availability is fetched once the page opens.
 */
export default function PropertyBooking({ slug }: { slug: string }) {
  const [chalets, setChalets] = useState<ChaletSetup[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/book/${slug}/setup`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { chalets: ChaletSetup[] };
        if (!cancelled) setChalets(body.chalets);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load availability just now. Please refresh the page, or{" "}
        <a href="/contact" className="underline">
          contact us
        </a>{" "}
        to book.
      </p>
    );
  }
  if (!chalets) {
    return (
      <div aria-busy="true" className="space-y-3" aria-label="Loading availability">
        <div className="h-6 w-1/3 animate-pulse bg-border" />
        <div className="grid gap-8 md:grid-cols-2">
          <div className="aspect-[7/6] animate-pulse bg-border/60" />
          <div className="hidden aspect-[7/6] animate-pulse bg-border/60 md:block" />
        </div>
      </div>
    );
  }
  return <AvailabilityCalendar chalets={chalets} />;
}
