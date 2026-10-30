"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { ChaletCalendarResponse } from "@/app/api/chalet-calendar/route";
import { lodgifyCheckoutUrl } from "@/lib/lodgify-checkout";

// One colour per chalet, in the order the API returns them (this page's
// chalet first). Moss and oak are both brand colours and easy to tell apart.
const SWATCHES = ["bg-primary", "bg-oak"];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const longDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const toDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
function addDays(date: string, days: number) {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}
const nightsBetween = (from: string, to: string) => Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);

/** The days of a month, padded to start on a Monday. */
function monthGrid(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => iso(new Date(Date.UTC(year, month, i + 1)))),
  ];
}

type Status = "loading" | "error" | "ready";

export default function TwinChaletCalendar({ slug }: { slug: string }) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<ChaletCalendarResponse | null>(null);
  const [monthOffset, setMonthOffset] = useState(0);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [checkOut, setCheckOut] = useState<string | null>(null);
  const [adults, setAdults] = useState(2);
  const [pets, setPets] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/chalet-calendar?slug=${encodeURIComponent(slug)}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body: ChaletCalendarResponse) => {
        if (cancelled) return;
        setData(body);
        setStatus("ready");
      })
      .catch(() => !cancelled && setStatus("error"));
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const taken = useMemo(() => data?.chalets.map((c) => new Set(c.unavailable)) ?? [], [data]);

  if (status === "loading") {
    return <p className="text-sm text-muted-foreground">Loading both chalets&apos; calendars…</p>;
  }
  if (status === "error" || !data) {
    return (
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t load the calendars just now.{" "}
        <Link href="/contact" className="font-semibold text-primary hover:underline">
          Get in touch
        </Link>{" "}
        and we&apos;ll check your dates for you.
      </p>
    );
  }

  const { chalets, from, to } = data;
  const freeOn = (night: string) => taken.map((set) => !set.has(night));
  const selectingCheckIn = !checkIn || Boolean(checkOut);

  function choose(day: string) {
    if (selectingCheckIn || !checkIn || day <= checkIn) {
      setCheckIn(day);
      setCheckOut(null);
    } else {
      setCheckOut(day);
    }
  }

  const start = toDate(from);
  const months = [0, 1].map((i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthOffset + i, 1));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
  });
  const lastOffset = (toDate(to).getUTCFullYear() - start.getUTCFullYear()) * 12 + toDate(to).getUTCMonth() - start.getUTCMonth() - 1;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-muted-foreground">Guests</span>
          <select
            value={adults}
            onChange={(e) => setAdults(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value={1}>1 adult</option>
            <option value={2}>2 adults</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-muted-foreground">Dogs</span>
          <select
            value={pets}
            onChange={(e) => setPets(Number(e.target.value))}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value={0}>No dogs</option>
            <option value={1}>1 dog</option>
            <option value={2}>2 dogs</option>
          </select>
        </label>
        <ul className="flex flex-wrap gap-x-5 gap-y-1 pb-2 text-sm text-muted-foreground">
          {chalets.map((c, i) => (
            <li key={c.slug} className="flex items-center gap-2">
              <span className={`inline-block h-2 w-5 rounded-full ${SWATCHES[i]}`} aria-hidden />
              {c.name} free
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonthOffset((m) => Math.max(0, m - 1))}
          disabled={monthOffset === 0}
          className="rounded-full border border-border px-3 py-1 text-sm disabled:opacity-40"
          aria-label="Previous month"
        >
          ←
        </button>
        <p className="text-sm text-muted-foreground">
          {!checkIn ? "Choose your check-in date" : !checkOut ? "Now choose your check-out date" : "Pick a new check-in date to change"}
        </p>
        <button
          type="button"
          onClick={() => setMonthOffset((m) => Math.min(lastOffset, m + 1))}
          disabled={monthOffset >= lastOffset}
          className="rounded-full border border-border px-3 py-1 text-sm disabled:opacity-40"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="mt-4 grid gap-8 sm:grid-cols-2">
        {months.map(({ year, month }, mi) => (
          <div key={`${year}-${month}`} className={mi === 1 ? "hidden sm:block" : undefined}>
            <h3 className="text-center text-sm font-semibold text-foreground">
              {monthLabel.format(new Date(Date.UTC(year, month, 1)))}
            </h3>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {monthGrid(year, month).map((day, di) => {
                if (!day) return <span key={`pad-${di}`} />;
                const outOfRange = day < from || day > to;
                const free = freeOn(day);
                const noneFree = free.every((f) => !f);
                // A night nobody can stay can still be someone's check-out day.
                const disabled = outOfRange || (selectingCheckIn && noneFree) || (!selectingCheckIn && checkIn !== null && day <= checkIn && noneFree);
                const isEnd = day === checkIn || day === checkOut;
                const inRange = checkIn && checkOut && day > checkIn && day < checkOut;
                const label = `${dayLabel.format(toDate(day))}: ${chalets
                  .map((c, i) => `${c.name} ${free[i] ? "free" : "booked"}`)
                  .join(", ")}`;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => choose(day)}
                    aria-label={label}
                    aria-pressed={isEnd}
                    className={`flex h-12 flex-col items-center justify-center rounded-lg text-sm transition-colors disabled:cursor-not-allowed ${
                      isEnd
                        ? "bg-foreground text-background"
                        : inRange
                          ? "bg-surface"
                          : outOfRange || noneFree
                            ? "text-muted-foreground/50"
                            : "hover:bg-surface"
                    }`}
                  >
                    <span className={noneFree && !isEnd ? "line-through" : undefined}>{toDate(day).getUTCDate()}</span>
                    {!outOfRange && (
                      <span className="mt-1 flex gap-0.5" aria-hidden>
                        {free.map((f, i) => (
                          <span key={i} className={`h-1.5 w-2.5 rounded-full ${f ? SWATCHES[i] : "bg-border"}`} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {checkIn && checkOut && (
        <StayResults
          chalets={chalets}
          taken={taken}
          checkIn={checkIn}
          checkOut={checkOut}
          adults={adults}
          pets={pets}
        />
      )}
    </div>
  );
}

function StayResults({
  chalets,
  taken,
  checkIn,
  checkOut,
  adults,
  pets,
}: {
  chalets: ChaletCalendarResponse["chalets"];
  taken: Set<string>[];
  checkIn: string;
  checkOut: string;
  adults: number;
  pets: number;
}) {
  const nights = nightsBetween(checkIn, checkOut);
  const results = chalets.map((c, i) => {
    let free = true;
    for (let night = checkIn; night < checkOut; night = addDays(night, 1)) {
      if (taken[i].has(night)) free = false;
    }
    const minNights = c.minNightsByArrival[checkIn] ?? c.defaultMinNights;
    return { chalet: c, free, minNights, tooShort: nights < minNights };
  });
  const [here, twin] = results;
  const twinSaves = !here.free && twin.free;

  return (
    <div className="mt-8 border-t border-border pt-6" aria-live="polite">
      <p className="text-sm font-semibold text-foreground">
        {dayLabel.format(toDate(checkIn))} → {dayLabel.format(toDate(checkOut))} · {nights} night{nights === 1 ? "" : "s"}
      </p>
      {twinSaves && (
        <p className="mt-2 text-sm text-foreground">
          {here.chalet.name} is taken on some of these nights, but {twin.chalet.name}, the identical studio next door, is
          free for your whole stay.
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {results.map(({ chalet, free, minNights, tooShort }, i) => (
          <li
            key={chalet.slug}
            className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-4 py-3 text-sm ${
              twinSaves && i === 1 ? "border-primary ring-1 ring-primary" : "border-border"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`inline-block h-2 w-5 rounded-full ${SWATCHES[i]}`} aria-hidden />
              <span className="font-semibold">{chalet.name}</span>
              <span className="text-muted-foreground">
                {!free
                  ? "· not available for these dates"
                  : tooShort
                    ? `· minimum stay from ${longDay.format(toDate(checkIn))} is ${minNights} nights`
                    : "· available"}
              </span>
            </span>
            {free && !tooShort && (
              <a
                href={lodgifyCheckoutUrl(chalet.rentalId, { arrival: checkIn, departure: checkOut, adults, pets })}
                target="_blank"
                rel="noopener"
                className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Book {chalet.name}
              </a>
            )}
          </li>
        ))}
      </ul>
      {results.every((r) => !r.free) && (
        <p className="mt-4 text-sm text-muted-foreground">
          Neither chalet is free for all of these nights. Try moving your dates by a night or two, or{" "}
          <Link href="/contact" className="font-semibold text-primary hover:underline">
            get in touch
          </Link>{" "}
          and we&apos;ll help.
        </p>
      )}
    </div>
  );
}
