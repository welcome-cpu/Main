"use client";

import { useMemo, useState } from "react";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import type { PublicCalendar } from "@/lib/booking/public";
import { addDays, daysBetween } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import type { Quote, QuoteError } from "@/lib/pricing/quote";

export type PublicExtra = {
  id: string;
  name: string;
  description: string | null;
  pricePence: number;
  pricingType: "PER_STAY" | "PER_NIGHT" | "PER_GUEST" | "PER_GUEST_PER_NIGHT";
  maxQuantity: number;
};

type QuoteResponse = {
  available: boolean;
  nights: number;
  reasons: { code: string; message: string }[];
  quote: Quote | null;
  quoteError: QuoteError | null;
};

const PRICING_LABELS: Record<PublicExtra["pricingType"], string> = {
  PER_STAY: "per stay",
  PER_NIGHT: "per night",
  PER_GUEST: "per guest",
  PER_GUEST_PER_NIGHT: "per guest per night",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const show = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));

type Guests = { adults: number; children: number; infants: number; pets: number };

export default function AvailabilityCalendar({
  calendar,
  slug,
  extras,
}: {
  calendar: PublicCalendar;
  slug: string;
  extras: PublicExtra[];
}) {
  const { property, today, firstCheckIn, lastCheckIn } = calendar;
  const [monthIndex, setMonthIndex] = useState(0);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [guests, setGuests] = useState<Guests>({ adults: Math.min(2, property.maxGuests), children: 0, infants: 0, pets: 0 });
  // Any change invalidates the price shown, so it must be fetched again.
  const updateGuests = (g: Guests) => {
    setResult(null);
    setGuests(g);
  };
  const [chosenExtras, setChosenExtras] = useState<Record<string, number>>({});
  const [discountCode, setDiscountCode] = useState("");
  const [result, setResult] = useState<QuoteResponse | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unavailable = useMemo(() => {
    const nights = new Set<string>();
    for (const r of calendar.unavailable) {
      for (let d = r.start; d < r.end; d = addDays(d, 1)) nights.add(d);
    }
    return nights;
  }, [calendar.unavailable]);

  // With a check-in chosen, the latest possible check-out: the stay plus its
  // own turnover nights must end before the next unavailable night.
  const latestCheckOut = useMemo(() => {
    if (!checkIn) return null;
    const limit = addDays(checkIn, property.defaultMaxNights);
    for (let d = checkIn; d < limit; d = addDays(d, 1)) {
      if (unavailable.has(d)) return addDays(d, -property.turnoverNights);
    }
    return limit;
  }, [checkIn, unavailable, property.defaultMaxNights, property.turnoverNights]);

  const canCheckIn = (d: string) => d >= firstCheckIn && d <= lastCheckIn && !unavailable.has(d);
  const canCheckOut = (d: string) =>
    checkIn !== null && latestCheckOut !== null && d > checkIn && d <= latestCheckOut;

  function choose(d: string) {
    setResult(null);
    setError(null);
    if (checkIn && !checkOut && canCheckOut(d)) {
      setCheckOut(d);
    } else if (canCheckIn(d)) {
      setCheckIn(d);
      setCheckOut(null);
    }
  }

  async function check() {
    if (!checkIn || !checkOut) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch(`/api/quote/${slug}`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkIn,
          checkOut,
          ...guests,
          extras: Object.entries(chosenExtras)
            .filter(([, quantity]) => quantity > 0)
            .map(([id, quantity]) => ({ id, quantity })),
          discountCode: discountCode.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.error ?? "Something went wrong. Please try again.");
      else setResult(body as QuoteResponse);
    } catch {
      setError("Couldn't reach the server. Please check your connection and try again.");
    } finally {
      setChecking(false);
    }
  }

  const firstMonth = `${today.slice(0, 7)}-01`;
  const months = [0, 1].map((i) => addMonths(firstMonth, monthIndex + i));
  const lastMonth = `${lastCheckIn.slice(0, 7)}-01`;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthIndex((i) => Math.max(0, i - 1))}
          disabled={monthIndex === 0}
          className="px-3 py-1 text-sm underline disabled:opacity-30"
        >
          ← Previous
        </button>
        <button
          type="button"
          onClick={() => setMonthIndex((i) => i + 1)}
          disabled={months[1] >= lastMonth}
          className="px-3 py-1 text-sm underline disabled:opacity-30"
        >
          Next →
        </button>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        {months.map((month) => (
          <Month
            key={month}
            month={month}
            dayState={(d) => {
              const inRange = checkIn && checkOut && d > checkIn && d < checkOut;
              const selected = d === checkIn || d === checkOut;
              const selectable = checkIn && !checkOut ? canCheckOut(d) || canCheckIn(d) : canCheckIn(d);
              return { selected: Boolean(selected), inRange: Boolean(inRange), unavailable: unavailable.has(d), selectable };
            }}
            onChoose={choose}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-3 w-3 border border-border bg-surface align-middle" /> Available</span>
        <span><span className="inline-block h-3 w-3 bg-muted align-middle" /> Booked</span>
        <span><span className="inline-block h-3 w-3 bg-primary align-middle" /> Your dates</span>
      </div>

      <div className="border border-border bg-surface p-4 text-sm">
        {!checkIn && <p>Choose your check-in date.</p>}
        {checkIn && !checkOut && (
          <p>
            Check-in {show(checkIn)}. Now choose your check-out date
            {property.defaultMinNights > 1 && ` (minimum stay usually ${property.defaultMinNights} nights)`}.
          </p>
        )}
        {checkIn && checkOut && (
          <p>
            {show(checkIn)} → {show(checkOut)} · {daysBetween(checkIn, checkOut)} nights
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Check-in from {property.checkInTime}, check-out by {property.checkOutTime}.
        </p>
      </div>

      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium text-foreground-strong">Guests</legend>
        <Counter label="Adults" value={guests.adults} min={1} max={property.maxGuests - guests.children} onChange={(adults) => updateGuests({ ...guests, adults })} />
        <Counter label="Children" value={guests.children} min={0} max={property.maxGuests - guests.adults} onChange={(children) => updateGuests({ ...guests, children })} />
        <Counter label="Infants (under 2)" value={guests.infants} min={0} max={2} onChange={(infants) => updateGuests({ ...guests, infants })} />
        <Counter label="Pets" value={guests.pets} min={0} max={property.maxPets} onChange={(pets) => updateGuests({ ...guests, pets })} />
      </fieldset>

      {extras.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-foreground-strong">Extras</legend>
          {extras.map((x) => {
            const perGuest = x.pricingType === "PER_GUEST" || x.pricingType === "PER_GUEST_PER_NIGHT";
            const max = perGuest ? 1 : x.maxQuantity;
            const quantity = chosenExtras[x.id] ?? 0;
            const setQuantity = (q: number) => {
              setResult(null);
              setChosenExtras({ ...chosenExtras, [x.id]: q });
            };
            return (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span>
                  <span className="font-medium text-foreground-strong">{x.name}</span> ·{" "}
                  {formatPence(x.pricePence)} {PRICING_LABELS[x.pricingType]}
                  {x.description && <span className="block text-xs text-muted-foreground">{x.description}</span>}
                </span>
                {max === 1 ? (
                  <input
                    type="checkbox"
                    aria-label={`Add ${x.name}`}
                    checked={quantity === 1}
                    onChange={(e) => setQuantity(e.target.checked ? 1 : 0)}
                    className="h-5 w-5"
                  />
                ) : (
                  <Counter label={x.name} value={quantity} min={0} max={max} onChange={setQuantity} />
                )}
              </div>
            );
          })}
        </fieldset>
      )}

      <label className="block text-sm">
        <span className="font-medium text-foreground-strong">Discount code (optional)</span>
        <input
          value={discountCode}
          onChange={(e) => {
            setResult(null);
            setDiscountCode(e.target.value);
          }}
          maxLength={32}
          autoCapitalize="characters"
          className="mt-1 block w-full max-w-xs border border-border bg-surface px-3 py-2 uppercase"
        />
      </label>

      <button
        type="button"
        onClick={check}
        disabled={!checkIn || !checkOut || checking}
        className="w-full bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {checking ? "Checking…" : "Check availability and price"}
      </button>

      <div aria-live="polite">
        {error && <p className="text-sm text-red-700">{error}</p>}
        {result && (
          <div className={`border p-4 text-sm ${result.available ? "border-green-300 bg-green-50 text-green-900" : "border-red-300 bg-red-50 text-red-900"}`}>
            {result.available ? (
              <>
                <p className="font-semibold">Good news: these dates are available for {result.nights} nights.</p>
                {result.quote && (
                  <div className="mt-3 border-t border-green-300 pt-3 text-foreground">
                    <PriceBreakdown quote={result.quote} />
                  </div>
                )}
                {result.quoteError && <p className="mt-2 text-red-800">{result.quoteError.message}</p>}
              </>
            ) : (
              <>
                <p className="font-semibold">Sorry, we can&apos;t take this booking:</p>
                <ul className="mt-1 list-disc pl-5">
                  {result.reasons.map((r) => (
                    <li key={r.code}>{r.message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Bookings made on other websites can take a little while to show here
        {calendar.calendarsSyncedAt && ` (last updated ${new Date(calendar.calendarsSyncedAt).toLocaleString("en-GB", { timeZone: property.timezone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })})`}
        . We always confirm availability again before taking payment.
      </p>
    </div>
  );
}

function Month({
  month,
  dayState,
  onChoose,
}: {
  month: string;
  dayState: (d: string) => { selected: boolean; inRange: boolean; unavailable: boolean; selectable: boolean };
  onChoose: (d: string) => void;
}) {
  const first = new Date(`${month}T00:00:00Z`);
  const leadingBlanks = (first.getUTCDay() + 6) % 7; // Monday first
  const days = daysBetween(month, addMonths(month, 1));

  return (
    <div>
      <h3 className="mb-2 text-center font-medium text-foreground-strong">{monthLabel.format(first)}</h3>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <div key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = addDays(month, i);
          const s = dayState(d);
          const cls = s.selected
            ? "bg-primary text-primary-foreground"
            : s.inRange
              ? "bg-primary/20 text-foreground-strong"
              : s.unavailable
                ? "bg-muted text-muted-foreground line-through"
                : s.selectable
                  ? "border border-border bg-surface hover:border-primary"
                  : "text-muted-foreground/50";
          return (
            <button
              key={d}
              type="button"
              disabled={!s.selectable && !s.selected}
              onClick={() => onChoose(d)}
              aria-pressed={s.selected}
              aria-label={`${show(d)}${s.unavailable ? ", booked" : ""}`}
              className={`aspect-square text-sm disabled:cursor-default ${cls}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Counter({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="text-sm">
      <span className="block text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-3">
        <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} className="h-8 w-8 border border-border disabled:opacity-30" aria-label={`Fewer ${label.toLowerCase()}`}>
          −
        </button>
        <span className="w-4 text-center font-medium text-foreground-strong">{value}</span>
        <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} className="h-8 w-8 border border-border disabled:opacity-30" aria-label={`More ${label.toLowerCase()}`}>
          +
        </button>
      </div>
    </div>
  );
}

/** First day of the month `n` months after `month` (YYYY-MM-01). */
function addMonths(month: string, n: number) {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
