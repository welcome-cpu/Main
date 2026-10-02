"use client";

import { useCallback, useEffect, useState } from "react";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import Turnstile from "@/components/Turnstile";
import { formatPence } from "@/lib/money";
import type { Quote } from "@/lib/pricing/quote";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export type StayPayload = {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  infants: number;
  pets: number;
  extras: { id: string; quantity: number }[];
  discountCode: string | null;
};

type Hold = { reservationId: string; reference: string; accessToken: string; payBy: string; quote: Quote };

const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const show = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));

export default function CheckoutStep({
  slug,
  propertyName,
  stay,
  quote,
  onBack,
}: {
  slug: string;
  propertyName: string;
  stay: StayPayload;
  quote: Quote;
  onBack: () => void;
}) {
  const [hold, setHold] = useState<Hold | null>(null);
  return hold ? (
    <HeldView hold={hold} propertyName={propertyName} onReleased={onBack} />
  ) : (
    <DetailsForm slug={slug} stay={stay} quote={quote} onBack={onBack} onHeld={setHold} />
  );
}

function DetailsForm({
  slug,
  stay,
  quote,
  onBack,
  onHeld,
}: {
  slug: string;
  stay: StayPayload;
  quote: Quote;
  onBack: () => void;
  onHeld: (hold: Hold) => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState("");
  const handleVerify = useCallback((token: string) => setTurnstileToken(token), []);

  async function submit(form: FormData) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/book/${slug}/hold`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stay,
          guest: {
            firstName: form.get("firstName"),
            lastName: form.get("lastName"),
            email: form.get("email"),
            phone: form.get("phone"),
            country: null,
            message: form.get("message"),
          },
          acceptTerms: form.get("acceptTerms") === "on",
          turnstileToken: turnstileToken || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      try {
        sessionStorage.setItem(`gamrie-hold:${body.reservationId}`, body.accessToken);
      } catch {
        // Storage can be unavailable (private browsing); the hold still works this session.
      }
      onHeld(body as Hold);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const input = "mt-1 block w-full border border-border bg-surface px-3 py-2";
  return (
    <form action={submit} className="space-y-6">
      <div className="border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-foreground-strong">
          {show(stay.checkIn)} → {show(stay.checkOut)}
        </p>
        <PriceBreakdown quote={quote} />
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold text-foreground-strong">Your details</legend>
        <label className="block text-sm">
          First name
          <input name="firstName" required maxLength={100} autoComplete="given-name" className={input} />
        </label>
        <label className="block text-sm">
          Last name
          <input name="lastName" required maxLength={100} autoComplete="family-name" className={input} />
        </label>
        <label className="block text-sm">
          Email
          <input name="email" type="email" required maxLength={254} autoComplete="email" className={input} />
        </label>
        <label className="block text-sm">
          Phone
          <input name="phone" type="tel" required maxLength={40} autoComplete="tel" className={input} />
        </label>
        <label className="block text-sm sm:col-span-2">
          Anything we should know? (optional)
          <textarea name="message" maxLength={2000} rows={3} className={input} />
        </label>
      </fieldset>

      <label className="flex items-start gap-3 text-sm">
        <input name="acceptTerms" type="checkbox" required className="mt-1 h-4 w-4" />
        <span>
          I accept the booking terms:{" "}
          {quote.balanceDueDate
            ? `a deposit of ${formatPence(quote.dueNowPence, quote.currency)} now and the balance of ${formatPence(quote.balancePence, quote.currency)} on ${show(quote.balanceDueDate)}`
            : `payment of ${formatPence(quote.dueNowPence, quote.currency)} in full now`}
          . All payments are non-refundable, so we recommend travel insurance.
        </span>
      </label>

      {TURNSTILE_SITE_KEY && <Turnstile siteKey={TURNSTILE_SITE_KEY} onVerify={handleVerify} />}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting || (Boolean(TURNSTILE_SITE_KEY) && !turnstileToken)}
          className="bg-primary px-6 py-3 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Holding your dates…" : "Continue to payment"}
        </button>
        <button type="button" onClick={onBack} className="text-sm underline">
          Change dates or guests
        </button>
      </div>
    </form>
  );
}

function HeldView({ hold, propertyName, onReleased }: { hold: Hold; propertyName: string; onReleased: () => void }) {
  const payBy = new Date(hold.payBy).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = Math.max(0, payBy - now);
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  async function release() {
    setReleasing(true);
    await fetch(`/api/reservations/${hold.reservationId}`, {
      method: "DELETE",
      headers: { "x-access-token": hold.accessToken },
    }).catch(() => undefined);
    try {
      sessionStorage.removeItem(`gamrie-hold:${hold.reservationId}`);
    } catch {}
    onReleased();
  }

  if (remaining === 0) {
    return (
      <div className="space-y-4">
        <p className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          Your hold has expired and the dates have been released. You can start again if they&apos;re still free.
        </p>
        <button type="button" onClick={onReleased} className="text-sm underline">
          Start again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border border-green-300 bg-green-50 p-4 text-sm text-green-900">
        <p className="font-semibold">
          {propertyName} is held for you for {minutes}:{String(seconds).padStart(2, "0")}
        </p>
        <p className="mt-1">
          Complete payment before then to confirm your booking. Reference <strong>{hold.reference}</strong>.
        </p>
      </div>
      <div className="border border-border bg-surface p-4">
        <PriceBreakdown quote={hold.quote} />
      </div>
      <p className="text-sm text-muted-foreground">Online payment is being added in the next update.</p>
      <button type="button" onClick={release} disabled={releasing} className="text-sm underline disabled:opacity-50">
        {releasing ? "Releasing…" : "Cancel and change dates"}
      </button>
    </div>
  );
}
