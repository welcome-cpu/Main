"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import CheckoutStep, { type StayPayload } from "@/components/booking/CheckoutStep";
import PriceBreakdown from "@/components/booking/PriceBreakdown";
import type { PublicCalendar } from "@/lib/booking/public";
import type { ChaletSetup, PublicExtra } from "@/lib/booking/setup";
import { addDays, daysBetween } from "@/lib/dates";
import { formatPence } from "@/lib/money";
import type { Quote, QuoteError } from "@/lib/pricing/quote";

type QuoteResponse = {
  available: boolean;
  nights: number;
  reasons: { code: string; message: string }[];
  quote: Quote | null;
  quoteError: QuoteError | null;
};

/** Whether a chalet can't take the stay because the dates are taken there. */
const takenAt = (r: ChaletResult | undefined) =>
  r?.state === "taken" || (r?.state === "done" && r.response.reasons.some((x) => x.code === "DATES_TAKEN"));

/** One chalet's answer for the chosen stay. */
type ChaletResult =
  | { state: "loading" }
  | { state: "taken" }
  | { state: "error"; message: string }
  | { state: "done"; response: QuoteResponse };

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

/** Minimum nights for a stay arriving on `d`. */
const minNightsAt = (c: PublicCalendar, d: string) => c.minNightsByArrival[d] ?? c.property.defaultMinNights;

/**
 * The latest check-out from `checkIn` at one chalet, or null if no stay can
 * start there: the stay plus its own turnover nights must end before the
 * next booked night, and that must leave room for the minimum stay.
 */
function latestCheckOutFrom(checkIn: string, calendar: PublicCalendar, booked: Set<string>) {
  if (!canCheckInAt(checkIn, calendar, booked)) return null;
  const { defaultMaxNights, turnoverNights } = calendar.property;
  let latest = addDays(checkIn, defaultMaxNights);
  for (let d = checkIn; d < latest; d = addDays(d, 1)) {
    if (booked.has(d)) {
      latest = addDays(d, -turnoverNights);
      break;
    }
  }
  return daysBetween(checkIn, latest) >= minNightsAt(calendar, checkIn) ? latest : null;
}

/**
 * Nights that some bookable stay can include. A free night in a gap too
 * short for the minimum stay can't be booked, so it isn't one of these.
 */
function bookableNights(calendar: PublicCalendar, booked: Set<string>) {
  const nights = new Set<string>();
  for (let d = calendar.firstCheckIn; d <= calendar.lastCheckIn; d = addDays(d, 1)) {
    const latest = latestCheckOutFrom(d, calendar, booked);
    if (!latest) continue;
    for (let n = d; n < latest; n = addDays(n, 1)) nights.add(n);
  }
  return nights;
}

/**
 * Dates, guests and price for a property and, for the studio chalets, the
 * identical one next door: one calendar showing both, prices for each as
 * soon as dates are chosen, and booking either without leaving the page.
 * `chalets[0]` is the property the page is about.
 */
export default function AvailabilityCalendar({
  chalets,
  initial = null,
}: {
  chalets: ChaletSetup[];
  /** Dates and guests carried over from a search. */
  initial?: InitialStay | null;
}) {
  const primary = chalets[0].calendar;
  const { today } = primary;
  const firstMonth = `${today.slice(0, 7)}-01`;
  // Guest limits that suit every chalet shown; they're identical in practice.
  const maxGuests = Math.min(...chalets.map((c) => c.calendar.property.maxGuests));
  const maxPets = Math.min(...chalets.map((c) => c.calendar.property.maxPets));

  const [monthIndex, setMonthIndex] = useState(() =>
    initial ? Math.max(0, monthsBetween(firstMonth, `${initial.checkIn.slice(0, 7)}-01`)) : 0
  );
  const [checkIn, setCheckIn] = useState<string | null>(initial?.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(initial?.checkOut ?? null);
  const [guests, setGuests] = useState<Guests>(() => {
    const clamp = (v: number | undefined, min: number, max: number, fallback: number) =>
      v === undefined ? fallback : Math.max(min, Math.min(max, v));
    const adults = clamp(initial?.adults, 1, maxGuests, Math.min(2, maxGuests));
    return {
      adults,
      children: clamp(initial?.children, 0, maxGuests - adults, 0),
      infants: clamp(initial?.infants, 0, 2, 0),
      pets: clamp(initial?.pets, 0, maxPets, 0),
    };
  });
  const [chosenExtras, setChosenExtras] = useState<Record<string, number>>({});
  // Codes take effect when applied, so typing doesn't look anything up.
  const [codesOpen, setCodesOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState("");
  const [voucherInput, setVoucherInput] = useState("");
  const [codes, setCodes] = useState({ discount: "", voucher: "" });
  const [results, setResults] = useState<Record<string, ChaletResult>>({});
  const [checkout, setCheckout] = useState<{ slug: string; name: string; stay: StayPayload; quote: Quote } | null>(null);

  const booked = useMemo(() => chalets.map((c) => nightSet(c.calendar.unavailable)), [chalets]);
  const bookable = useMemo(() => chalets.map((c, i) => bookableNights(c.calendar, booked[i])), [chalets, booked]);
  const top = useRef<HTMLDivElement>(null);
  // Moving between choosing and checkout swaps the content; keep its top in view.
  const inCheckout = checkout !== null;
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [inCheckout]);

  const latest = checkIn ? chalets.map((c, i) => latestCheckOutFrom(checkIn, c.calendar, booked[i])) : [];
  const freeFor = (i: number) => Boolean(checkOut && latest[i] && checkOut <= latest[i]!);

  // A check-in is offered only where a long enough stay can start, and a
  // check-out only where the stay meets the minimum at a chalet that's free.
  const freeSomewhere = (d: string) => chalets.some((c, i) => latestCheckOutFrom(d, c.calendar, booked[i]) !== null);
  const canCheckOut = (d: string) =>
    checkIn !== null &&
    chalets.some(
      (c, i) => latest[i] !== null && d <= latest[i]! && daysBetween(checkIn, d) >= minNightsAt(c.calendar, checkIn)
    );

  // Extras can differ between chalets; each is quoted with its own.
  const allExtras = useMemo(() => {
    const byId = new Map<string, PublicExtra>();
    for (const c of chalets) for (const x of c.extras) byId.set(x.id, x);
    return [...byId.values()];
  }, [chalets]);

  function stayFor(chalet: ChaletSetup): StayPayload {
    const offered = new Set(chalet.extras.map((x) => x.id));
    return {
      checkIn: checkIn!,
      checkOut: checkOut!,
      ...guests,
      extras: Object.entries(chosenExtras)
        .filter(([id, quantity]) => quantity > 0 && offered.has(id))
        .map(([id, quantity]) => ({ id, quantity })),
      discountCode: codes.discount || null,
      voucherCode: codes.voucher || null,
    };
  }

  // Price this page's chalet as soon as the stay is complete, and again
  // whenever guests, extras or codes change. Only if it can't take the
  // stay is the chalet next door priced and offered. Latest answer wins.
  const stayKey = checkIn && checkOut ? JSON.stringify([checkIn, checkOut, guests, chosenExtras, codes]) : null;
  useEffect(() => {
    if (!stayKey) return;
    const controller = new AbortController();
    async function quote(chalet: ChaletSetup, i: number): Promise<ChaletResult> {
      const slug = chalet.slug;
      if (!freeFor(i)) {
        setResults((r) => ({ ...r, [slug]: { state: "taken" } }));
        return { state: "taken" };
      }
      setResults((r) => ({ ...r, [slug]: { state: "loading" } }));
      try {
        const res = await fetch(`/api/quote/${slug}`, {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(stayFor(chalet)),
          signal: controller.signal,
        });
        const body = await res.json();
        const result: ChaletResult = res.ok
          ? { state: "done", response: body as QuoteResponse }
          : { state: "error", message: body.error ?? "Something went wrong." };
        setResults((r) => ({ ...r, [slug]: result }));
        return result;
      } catch (error) {
        if ((error as Error).name === "AbortError") return { state: "loading" };
        const result: ChaletResult = { state: "error", message: "Couldn't reach the server. Please check your connection." };
        setResults((r) => ({ ...r, [slug]: result }));
        return result;
      }
    }
    const timer = setTimeout(async () => {
      const here = await quote(chalets[0], 0);
      if (controller.signal.aborted || !takenAt(here)) return;
      chalets.slice(1).forEach((c, i) => void quote(c, i + 1));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // stayKey captures everything the quotes depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stayKey]);

  function choose(d: string) {
    setResults({});
    if (checkIn && !checkOut && canCheckOut(d)) {
      setCheckOut(d);
    } else if (freeSomewhere(d)) {
      setCheckIn(d);
      setCheckOut(null);
    }
  }

  if (checkout) {
    return (
      <div ref={top} className="scroll-mt-24">
        <CheckoutStep
          slug={checkout.slug}
          propertyName={checkout.name}
          stay={checkout.stay}
          quote={checkout.quote}
          onBack={() => setCheckout(null)}
        />
      </div>
    );
  }

  const months = [0, 1].map((i) => addMonths(firstMonth, monthIndex + i));
  const lastCheckIn = chalets.map((c) => c.calendar.lastCheckIn).sort().at(-1)!;
  const lastMonth = `${lastCheckIn.slice(0, 7)}-01`;
  const twins = chalets.slice(1);
  const twinName = twins[0]?.calendar.property.name;
  const minNights = checkIn ? minNightsAt(primary, checkIn) : primary.property.defaultMinNights;
  // The chalet next door is only offered when this one can't take the stay.
  const offerTwins = twins.length > 0 && takenAt(results[chalets[0].slug]);
  const shown = offerTwins ? chalets : chalets.slice(0, 1);

  return (
    <div ref={top} className="scroll-mt-24 space-y-6">
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
              const selectable = checkIn && !checkOut ? canCheckOut(d) || freeSomewhere(d) : freeSomewhere(d);
              const unavailableHere = !bookable[0].has(d);
              return {
                selected: Boolean(selected),
                inRange: Boolean(inRange),
                unavailable: unavailableHere,
                booked: booked[0].has(d),
                twinFree: unavailableHere && twins.some((_, i) => bookable[i + 1].has(d)),
                selectable,
              };
            }}
            onChoose={choose}
            twinName={twinName}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span><span className="inline-block h-3 w-3 border border-border bg-white align-middle" /> Available</span>
        <span><span className="text-muted-foreground/60 line-through">12</span> Not available</span>
        {twinName && (
          <span><span className="inline-block h-3 w-3 bg-oak/40 align-middle" /> Booked here, {twinName} free</span>
        )}
        <span><span className="inline-block h-3 w-3 bg-primary align-middle" /> Your dates</span>
      </div>

      <div className="border border-border bg-surface p-4 text-sm">
        {!checkIn && <p>Choose your check-in date.</p>}
        {checkIn && !checkOut && (
          <p>
            Check-in {show(checkIn)}. Now choose your check-out date
            {minNights > 1 && ` (minimum stay ${minNights} nights)`}.
          </p>
        )}
        {checkIn && checkOut && (
          <p>
            {show(checkIn)} → {show(checkOut)} · {daysBetween(checkIn, checkOut)} nights
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Check-in from {primary.property.checkInTime}, check-out by {primary.property.checkOutTime}.
        </p>
      </div>

      <fieldset className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <legend className="mb-2 text-sm font-medium text-foreground-strong">Guests</legend>
        <Counter label="Adults" value={guests.adults} min={1} max={maxGuests - guests.children} onChange={(adults) => setGuests({ ...guests, adults })} />
        <Counter label="Children" value={guests.children} min={0} max={maxGuests - guests.adults} onChange={(children) => setGuests({ ...guests, children })} />
        <Counter label="Infants (under 2)" value={guests.infants} min={0} max={2} onChange={(infants) => setGuests({ ...guests, infants })} />
        <Counter label="Pets" value={guests.pets} min={0} max={maxPets} onChange={(pets) => setGuests({ ...guests, pets })} />
      </fieldset>

      {allExtras.length > 0 && (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-foreground-strong">Extras</legend>
          {allExtras.map((x) => {
            const perGuest = x.pricingType === "PER_GUEST" || x.pricingType === "PER_GUEST_PER_NIGHT";
            const max = perGuest ? 1 : x.maxQuantity;
            const quantity = chosenExtras[x.id] ?? 0;
            const setQuantity = (q: number) => setChosenExtras({ ...chosenExtras, [x.id]: q });
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

      <div className="text-sm">
        {!codesOpen ? (
          <button type="button" onClick={() => setCodesOpen(true)} className="underline">
            Have a discount code or gift voucher?
          </button>
        ) : (
          <form
            className="flex flex-wrap items-end gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setCodes({ discount: discountInput.trim(), voucher: voucherInput.trim() });
            }}
          >
            <label className="block">
              <span className="font-medium text-foreground-strong">Discount code</span>
              <input
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                maxLength={32}
                autoCapitalize="characters"
                className="mt-1 block w-48 border border-border bg-surface px-3 py-2 uppercase"
              />
            </label>
            <label className="block">
              <span className="font-medium text-foreground-strong">Gift voucher code</span>
              <input
                value={voucherInput}
                onChange={(e) => setVoucherInput(e.target.value)}
                maxLength={40}
                autoCapitalize="characters"
                autoComplete="off"
                className="mt-1 block w-48 border border-border bg-surface px-3 py-2 uppercase"
              />
            </label>
            <button type="submit" className="border border-primary px-4 py-2 font-medium text-primary hover:bg-primary/10">
              Apply
            </button>
            <p className="w-full text-xs text-muted-foreground">
              With a voucher, anything it doesn&apos;t cover is paid by card when you book.
            </p>
          </form>
        )}
      </div>

      <div aria-live="polite" className="space-y-4">
        {checkIn && checkOut && (
          <>
            {offerTwins && chalets.every((c) => results[c.slug]?.state === "taken") && (
              <p className="border border-red-300 bg-red-50 p-4 text-sm text-red-900">
                Neither {chalets.map((c) => c.calendar.property.name).join(" nor ")} is free for all of these nights.
                Please choose other dates.
              </p>
            )}
            <div className={`grid gap-4 ${offerTwins ? "md:grid-cols-2" : ""}`}>
              {shown.map((chalet, i) => (
                <ChaletCard
                  key={chalet.slug}
                  name={chalet.calendar.property.name}
                  isThisPage={i === 0}
                  showName={offerTwins}
                  result={results[chalet.slug] ?? { state: "loading" }}
                  hideIfTaken={offerTwins}
                  onBook={(quote) =>
                    setCheckout({ slug: chalet.slug, name: chalet.calendar.property.name, stay: stayFor(chalet), quote })
                  }
                />
              ))}
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Bookings made on other websites can take a little while to show here
        {primary.calendarsSyncedAt &&
          ` (last updated ${new Date(primary.calendarsSyncedAt).toLocaleString("en-GB", { timeZone: primary.property.timezone, hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })})`}
        . We always confirm availability again before taking payment.
      </p>
    </div>
  );
}

function ChaletCard({
  name,
  isThisPage,
  showName,
  result,
  hideIfTaken,
  onBook,
}: {
  name: string;
  isThisPage: boolean;
  showName: boolean;
  result: ChaletResult;
  hideIfTaken: boolean;
  onBook: (quote: Quote) => void;
}) {
  if (result.state === "taken" && hideIfTaken) {
    return (
      <div className="self-start border border-border bg-muted p-4 text-sm text-muted-foreground" data-chalet={name}>
        <p className="font-semibold text-foreground-strong">{name}</p>
        <p className="mt-1">Booked for some of these nights.</p>
      </div>
    );
  }
  const heading = showName && (
    <p className="font-semibold text-foreground-strong">
      {name}
      {!isThisPage && <span className="ml-2 text-xs font-normal text-muted-foreground">the identical chalet next door</span>}
    </p>
  );

  if (result.state === "loading") {
    return (
      <div className="border border-border bg-surface p-4 text-sm" data-chalet={name}>
        {heading}
        <p className="mt-1 text-muted-foreground">Checking the price…</p>
      </div>
    );
  }
  if (result.state === "error") {
    return (
      <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900" data-chalet={name}>
        {heading}
        <p className="mt-1">{result.message}</p>
      </div>
    );
  }
  if (result.state === "taken" || !result.response.available) {
    return (
      <div className="border border-red-300 bg-red-50 p-4 text-sm text-red-900" data-chalet={name}>
        {heading}
        <p className="font-semibold">Sorry, we can&apos;t take this booking:</p>
        <ul className="mt-1 list-disc pl-5">
          {result.state === "taken" ? (
            <li>These dates aren&apos;t free.</li>
          ) : (
            result.response.reasons.map((r) => <li key={r.code}>{r.message}</li>)
          )}
        </ul>
      </div>
    );
  }

  const { quote, quoteError, nights } = result.response;
  return (
    <div className="border border-green-300 bg-green-50 p-4 text-sm" data-chalet={name}>
      {heading}
      <p className="font-semibold text-green-900">Available for {nights} nights</p>
      {quote && (
        <div className="mt-3 border-t border-green-300 pt-3 text-foreground">
          <PriceBreakdown quote={quote} />
        </div>
      )}
      {quoteError && <p className="mt-2 text-red-800">{quoteError.message}</p>}
      {quote && (
        <button
          type="button"
          onClick={() => onBook(quote)}
          className="mt-4 w-full bg-primary px-4 py-3 font-medium text-primary-foreground hover:opacity-90"
        >
          {showName ? `Book ${name}` : "Book now"}
        </button>
      )}
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
  dayState: (d: string) => {
    selected: boolean;
    inRange: boolean;
    unavailable: boolean;
    booked: boolean;
    twinFree: boolean;
    selectable: boolean;
  };
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
                ? "bg-oak/40 text-foreground-strong hover:outline hover:outline-primary"
                : s.unavailable
                  ? "text-muted-foreground/60 line-through"
                  : s.selectable
                    ? "border border-border bg-white font-medium text-foreground-strong hover:border-primary"
                    : "text-muted-foreground/50";
          return (
            <button
              key={d}
              type="button"
              data-date={d}
              disabled={!s.selectable && !s.selected}
              onClick={() => onChoose(d)}
              aria-pressed={s.selected}
              aria-label={`${show(d)}${s.twinFree ? `, ${s.booked ? "booked" : "not available"}, ${twinName} free` : s.booked ? ", booked" : s.unavailable ? ", not available" : ""}`}
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
