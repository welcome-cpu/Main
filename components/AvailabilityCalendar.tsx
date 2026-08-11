"use client";

import { useEffect, useState } from "react";

type Period = { start: string; end: string; available: boolean };
type Status = "loading" | "unconfigured" | "error" | "ready";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

function isDateUnavailable(date: Date, periods: Period[]) {
  return periods.some((period) => {
    if (period.available) return false;
    const start = new Date(period.start);
    const end = new Date(period.end);
    return date >= start && date < end;
  });
}

function buildMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days: (Date | null)[] = Array(startOffset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(year, month, d));
  }
  return days;
}

export default function AvailabilityCalendar({
  propertySlug,
}: {
  propertySlug: string;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [periods, setPeriods] = useState<Period[]>([]);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/availability/${propertySlug}`)
      .then(async (res) => {
        if (res.status === 503) {
          if (!cancelled) setStatus("unconfigured");
          return;
        }
        if (!res.ok) throw new Error("Failed to load availability.");
        const data = await res.json();
        if (!cancelled) {
          setPeriods(data.periods ?? []);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [propertySlug]);

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
        Loading availability…
      </div>
    );
  }

  if (status === "unconfigured" || status === "error") {
    return (
      <div className="rounded-xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
        Availability calendar coming soon.{" "}
        <a
          href="/contact"
          className="font-semibold text-primary hover:underline"
        >
          Get in touch
        </a>{" "}
        for current dates.
      </div>
    );
  }

  const today = new Date();
  const months = [0, 1].map((offset) => {
    const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    return { year: date.getFullYear(), month: date.getMonth() };
  });
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return (
    <div>
      <div className="grid gap-8 sm:grid-cols-2">
        {months.map(({ year, month }) => (
          <div key={`${year}-${month}`}>
            <p className="text-sm font-semibold text-foreground">
              {new Date(year, month, 1).toLocaleDateString("en-GB", {
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs">
              {WEEKDAYS.map((day, i) => (
                <span key={i} className="text-muted-foreground">
                  {day}
                </span>
              ))}
              {buildMonthGrid(year, month).map((date, i) => {
                if (!date) return <span key={i} />;
                const past = date < startOfToday;
                const unavailable = !past && isDateUnavailable(date, periods);
                return (
                  <span
                    key={i}
                    className={`flex h-7 items-center justify-center rounded-full ${
                      past
                        ? "text-muted-foreground/40"
                        : unavailable
                          ? "bg-border text-muted-foreground line-through"
                          : "bg-accent/15 text-foreground"
                    }`}
                  >
                    {date.getDate()}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Shaded dates are unavailable.
      </p>
    </div>
  );
}
