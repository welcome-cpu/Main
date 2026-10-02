"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import { formatPence } from "@/lib/money";
import type { Quote } from "@/lib/pricing/quote";

type View = {
  reservationId: string;
  reference: string;
  propertySlug: string;
  propertyName: string;
  status: "HOLD" | "CONFIRMED" | "CANCELLED" | "EXPIRED";
  checkIn: string;
  checkOut: string;
  payBy: string | null;
  quote: Quote;
  payment: { kind: string; status: string; amountPence: number } | null;
  checkoutUrl: string | null;
};

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const show = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));

/**
 * Where Stripe sends the guest back to. Reaching this page proves nothing:
 * it asks our server, which only reports "confirmed" once Stripe's webhook
 * has confirmed the payment.
 */
export default function BookingStatus({ reservationId, cancelled }: { reservationId: string; cancelled: boolean }) {
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<"no-token" | "not-found" | "network" | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let token: string | null = null;
    try {
      token = sessionStorage.getItem(`gamrie-hold:${reservationId}`);
    } catch {}

    async function poll(n: number) {
      // The access token lives only in the browser that started the booking.
      if (!token) return setProblem("no-token");
      try {
        const res = await fetch(`/api/reservations/${reservationId}`, {
          headers: { "x-access-token": token! },
          cache: "no-store",
        });
        if (res.status === 404) return setProblem("not-found");
        if (!res.ok) throw new Error();
        const body = (await res.json()) as View;
        if (stopped) return;
        setView(body);
        setAttempts(n);
        // Stripe usually confirms within seconds; keep checking for a while.
        const waiting = body.status === "HOLD" && !cancelled && n < 45;
        if (waiting) timer = setTimeout(() => poll(n + 1), 2000);
      } catch {
        if (!stopped) setProblem("network");
      }
    }
    poll(0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [reservationId, cancelled]);

  if (problem === "no-token") {
    return (
      <Notice tone="neutral" title="Thanks for booking with us">
        We can&apos;t show your booking in this browser. If you completed payment, you&apos;ll receive a confirmation email
        shortly. If not, please get in touch and quote your booking reference.
      </Notice>
    );
  }
  if (problem) {
    return (
      <Notice tone="neutral" title="We couldn't load your booking">
        Please refresh the page. If you completed payment, you&apos;ll receive a confirmation email shortly.
      </Notice>
    );
  }
  if (!view) return <p className="text-muted-foreground">Checking your booking…</p>;

  const q = view.quote;
  const stayLine = `${view.propertyName}, ${show(view.checkIn)} to ${show(view.checkOut)}`;

  if (view.status === "CONFIRMED") {
    return (
      <div className="space-y-6">
        <Notice tone="good" title="Your booking is confirmed">
          {stayLine}. Your booking reference is <strong>{view.reference}</strong>.
        </Notice>
        <div className="border border-border bg-surface p-4">
          <PriceBreakdown quote={q} />
        </div>
        <p className="text-sm text-muted-foreground">
          {q.balanceDueDate
            ? `We've taken your deposit of ${formatPence(q.dueNowPence, q.currency)}. The balance of ${formatPence(q.balancePence, q.currency)} will be charged to the same card on ${show(q.balanceDueDate)}.`
            : `We've taken your payment of ${formatPence(q.dueNowPence, q.currency)}.`}{" "}
          A confirmation email is on its way.
        </p>
      </div>
    );
  }

  if (view.status === "HOLD") {
    if (cancelled || attempts >= 45) {
      return (
        <div className="space-y-4">
          <Notice tone="neutral" title={cancelled ? "Payment not completed" : "We're still waiting for your payment"}>
            {stayLine}.{" "}
            {view.payBy && `Your dates are held until ${new Date(view.payBy).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}. `}
            {cancelled ? "You haven't been charged." : "If you've paid, this page will update shortly."}
          </Notice>
          <div className="flex flex-wrap gap-4">
            {view.checkoutUrl && (
              <a href={view.checkoutUrl} className="bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90">
                Return to payment
              </a>
            )}
            <ReleaseButton reservationId={view.reservationId} slug={view.propertySlug} />
          </div>
        </div>
      );
    }
    return <p className="text-muted-foreground">Confirming your payment with the bank… this usually takes a few seconds.</p>;
  }

  return (
    <div className="space-y-4">
      <Notice tone="bad" title="This booking wasn't completed">
        {stayLine}. Your hold expired or the dates were no longer available, so no payment has been taken. Any amount
        your bank shows as pending will be released.
      </Notice>
      <Link href={`/book/${view.propertySlug}`} className="text-sm underline">
        Choose dates again
      </Link>
    </div>
  );
}

function ReleaseButton({ reservationId, slug }: { reservationId: string; slug: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function release() {
    setBusy(true);
    let token = "";
    try {
      token = sessionStorage.getItem(`gamrie-hold:${reservationId}`) ?? "";
    } catch {}
    await fetch(`/api/reservations/${reservationId}`, { method: "DELETE", headers: { "x-access-token": token } }).catch(
      () => undefined
    );
    router.push(`/book/${slug}`);
  }
  return (
    <button type="button" onClick={release} disabled={busy} className="text-sm underline disabled:opacity-50">
      {busy ? "Releasing…" : "Cancel and choose other dates"}
    </button>
  );
}

function Notice({ tone, title, children }: { tone: "good" | "bad" | "neutral"; title: string; children: React.ReactNode }) {
  const styles = {
    good: "border-green-300 bg-green-50 text-green-900",
    bad: "border-red-300 bg-red-50 text-red-900",
    neutral: "border-border bg-surface text-foreground",
  }[tone];
  return (
    <div role="status" className={`border p-4 ${styles}`}>
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm">{children}</p>
    </div>
  );
}
