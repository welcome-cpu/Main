"use client";

import { useMemo, useState } from "react";
import CheckoutStep, { type StayPayload } from "@/components/booking/CheckoutStep";
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

export type InitialStay = { checkIn: string; checkOut: string } & Partial<Guests>;

/** Nights booked, from merged half-open ranges. */
function nightSet(ranges: PublicCalendar["unavailable"]) {
  const nights = new Set<string>();
  for (const r of ranges) {
    for (let d = r.start; d < r.end; d = addDays(d, 1)) nights.add(d);
  }
  return nights;
}

const canCheckInAt = (d: string, c: PublicCalendar, booked: Set<string>) =>
  d >= c.firstCheckIn && d <= c.lastCheckIn && !booked.has(d);

/**
 * The latest check-out from `checkIn` at one chalet, or null if it can't be
 * a check-in there: the stay plus its own turnover nights must end before
 * the next booked night.
 */
function latestCheckOutFrom(checkIn: string, calendar: PublicCalendar, booked: Set<string>) {
  if (!canCheckInAt(checkIn, calendar, booked)) return null;
  const { defaultMaxNights, turnoverNights } = calendar.property;
  const limit = addDays(checkIn, defaultMaxNights);
  for (let d = checkIn; d < limit; d = addDays(d, 1)) {
    if (booked.has(d)) return addDays(d, -turnoverNights);
  }
  return limit;
}

export default function AvailabilityCalendar({
  calendar,
  slug,
  extras,
  twin = null,
  initial = null,
}: {
  calendar: PublicCalendar;
  slug: string;
  extras: PublicExtra[];
  /** The identical chalet next door, offered when dates are taken here. */
  twin?: { slug: string; calendar: PublicCalendar } | null;
  /** Dates and guests carried over from a search or the chalet next door. */
  initial?: InitialStay | null;
}) {
  const { property, today } = calendar;
  const firstMonth = `${today.slice(0, 7)}-01`;
  const [monthIndex, setMonthIndex] = useState(() =>
    initial ? Math.max(0, monthsBetween(firstMonth, `${initial.checkIn.slice(0, 7)}-01`)) : 0
  );
  const [checkIn, setCheckIn] = useState<string | null>(initial?.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(initial?.checkOut ?? null);
  const [guests, setGuests] = useState<Guests>(() => {
    const clamp = (v: number | undefined, min: number, max: number, fallback: number) =>
      v === undefined ? fallback : Math.max(min, Math.min(max, v));
    const adults = clamp(initial?.adults, 1, property.maxGuests, Math.min(2, property.maxGuests));
    return {
      adults,
      children: clamp(initial?.children, 0, property.maxGuests - adults, 0),
      infants: clamp(initial?.infants, 0, 2, 0),
      pets: clamp(initial?.pets, 0, property.maxPets, 0),
    };
  });
  // Any change invalidates the price shown, so it must be fetched again.
  const updateGuests = (g: Guests) => {
    setResult(null);
    setGuests(g);
  };
  const [chosenExtras, setChosenExtras] = useState<Record<string, number>>({});
  const [discountCode, setDiscountCode] = useState("");
  const [voucherCode, setVoucherCode] = useState("");
  const [result, setResult] = useState<QuoteResponse | null>(null);
  const [checkout, setCheckout] = useState<{ stay: StayPayload; quote: Quote } | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unavailable = useMemo(() => nightSet(calendar.unavailable), [calendar.unavailable]);
  const twinUnavailable = useMemo(() => (twin ? nightSet(twin.calendar.unavailable) : null), [twin]);

  // Dates can be chosen if they're free here or next door; which chalet
  // they suit is shown once both are chosen.
  const latestHere = checkIn ? latestCheckOutFrom(checkIn, calendar, unavailable) : null;
  const latestTwin =
    checkIn && twin && twinUnavailable ? latestCheckOutFrom(checkIn, twin.calendar, twinUnavailable) : null;
  const latestCheckOut = [latestHere, latestTwin].filter((d): d is string => d !== null).sort().at(-1) ?? null;
  const freeHere = Boolean(checkOut && latestHere && checkOut <= latestHere);
  const freeTwin = Boolean(checkOut && latestTwin && checkOut <= latestTwin);

  const twinFree = (d: string) => Boolean(twin && twinUnavailable && canCheckInAt(d, twin.calendar, twinUnavailable));
  const canCheckIn = (d: string) => canCheckInAt(d, calendar, unavailable) || twinFree(d);
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

  function stayPayload(): StayPayload {
    return {
      checkIn: checkIn!,
      checkOut: checkOut!,
      ...guests,
      extras: Object.entries(chosenExtras)
        .filter(([, quantity]) => quantity > 0)
        .map(([id, quantity]) => ({ id, quantity })),
      discountCode: discountCode.trim() || null,
      voucherCode: voucherCode.trim() || null,
    };
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
        body: JSON.stringify(stayPayload()),
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

  if (checkout) {
    return (
      <CheckoutStep
        slug={slug}
        propertyName={property.name}
        stay={checkout.stay}
        quote={checkout.quote}
        onBack={() => {
          setCheckout(null);
          setResult(null);
        }}
      />
    );
  }

  const months = [0, 1].map((i) => addMonths(firstMonth, monthIndex + i));
  const lastCheckIn = [calendar.lastCheckIn, twin?.calendar.lastCheckIn ?? ""].sort().at(-1)!;
  const lastMonth = `${lastCheckIn.slice(0, 7)}-01`;
  const twinName = twin?.calendar.property.name;
  const twinHref =
    twin && checkIn && checkOut
      ? `/book/${twin.slug}?${new URLSearchParams({
          checkIn,
          checkOut,
          adults: String(guests.adults),
          children: String(guests.children),
          infants: String(guests.infants),
          pets: String(guests.pets),
        })}`
      : null;

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
              return {
                selected: Boolean(selected),
                inRange: Boolean(inRange),
                unavailable: unavailable.has(d),
                twinFree: unavailable.has(d) && twinFree(d),
                selectable,
              };
            }}
            onChoose={choose}
            twinName={twinName}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-3 w-3 border border-border bg-surface align-middle" /> Available</span>
        <span><span className="inline-block h-3 w-3 bg-muted align-middle" /> Booked</span>
        <span><span className="inline-block h-3 w-3 bg-primary align-middle" /> Your dates</span>
        {twinName && (
          <span><span className="inline-block h-3 w-3 bg-oak/40 align-middle" /> Booked here, {twinName} free</span>
        )}
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
        {checkIn && checkOut && twinName && freeHere && freeTwin && (
          <p className="mt-1 text-xs text-muted-foreground">
            {twinName}, the identical chalet next door, is free for these dates too.
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Check-in from {property.checkInTime}, check-out by {property.checkOutTime}.
        </p>
      </div>

      {checkIn && checkOut && !freeHere && freeTwin && twinHref && (
        <div className="border border-oak bg-oak/15 p-4 text-sm">
          <p className="font-semibold text-foreground-strong">
            {property.name} is booked for some of these nights, but {twinName} is free.
          </p>
          <p className="mt-1">{twinName} is the identical studio chalet right next door, with the same view.</p>
          <a href={twinHref} className="mt-3 inline-block bg-primary px-4 py-2 font-medium text-primary-foreground hover:opacity-90">
            Book {twinName} for these dates
          </a>
        </div>
      )}

      {checkIn && checkOut && twinName && !freeHere && !freeTwin && (
        <p className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          Neither {property.name} nor {twinName} is free for all of these nights. Please choose other dates.
        </p>
      )}

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

      <div className="grid gap-4 sm:grid-cols-2">
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
        <label className="block text-sm">
          <span className="font-medium text-foreground-strong">Gift voucher code (optional)</span>
          <input
            value={voucherCode}
            onChange={(e) => {
              setResult(null);
              setVoucherCode(e.target.value);
            }}
            maxLength={40}
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-1 block w-full max-w-xs border border-border bg-surface px-3 py-2 uppercase"
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            With a voucher, anything it doesn&apos;t cover is paid by card when you book.
          </span>
        </label>
      </div>

      <button
        type="button"
        onClick={check}
        disabled={!checkIn || !checkOut || checking || (twin !== null && !freeHere)}
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
                {result.quote && (
                  <button
                    type="button"
                    onClick={() => setCheckout({ stay: stayPayload(), quote: result.quote! })}
                    className="mt-4 w-full bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90"
                  >
                    Continue
                  </button>
                )}
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
  twinName,
}: {
  month: string;
  dayState: (d: string) => { selected: boolean; inRange: boolean; unavailable: boolean; twinFree: boolean; selectable: boolean };
  onChoose: (d: string) => void;
  twinName?: string;
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
              : s.twinFree
                ? "bg-oak/40 text-foreground-strong line-through hover:outline hover:outline-primary"
                : s.unavailable
                  ? "bg-muted text-muted-foreground line-through"
                  : s.selectable
                    ? "border border-border bg-surface hover:border-primary"
                    : "text-muted-foreground/50";
          return (
            <button
              key={d}
              type="button"
              data-date={d}
              disabled={!s.selectable && !s.selected}
              onClick={() => onChoose(d)}
              aria-pressed={s.selected}
              aria-label={`${show(d)}${s.twinFree ? `, booked, ${twinName} free` : s.unavailable ? ", booked" : ""}`}
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

/** Whole months from one YYYY-MM-01 to another. */
function monthsBetween(from: string, to: string) {
  return (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7));
}

/** First day of the month `n` months after `month` (YYYY-MM-01). */
function addMonths(month: string, n: number) {
  const d = new Date(`${month}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
