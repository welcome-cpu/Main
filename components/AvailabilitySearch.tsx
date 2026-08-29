"use client";

import Link from "next/link";
import { useState } from "react";

type Result = {
  slug: string;
  name: string;
  sleeps: number;
  available: boolean;
};

type Status = "idle" | "loading" | "unconfigured" | "error" | "ready";

export default function AvailabilitySearch() {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<Result[]>([]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) return;

    setStatus("loading");
    try {
      const res = await fetch(
        `/api/search?start=${checkIn}&end=${checkOut}&guests=${guests}`
      );
      if (res.status === 503) {
        setStatus("unconfigured");
        return;
      }
      if (!res.ok) throw new Error("Search failed.");
      const data = await res.json();
      setResults(data.results ?? []);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl bg-background p-5 text-foreground shadow-lg">
      <form
        onSubmit={handleSearch}
        className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]"
      >
        <label className="text-sm">
          <span className="mb-1 block font-medium text-muted-foreground">
            Check-in
          </span>
          <input
            type="date"
            required
            value={checkIn}
            onChange={(e) => setCheckIn(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-muted-foreground">
            Check-out
          </span>
          <input
            type="date"
            required
            value={checkOut}
            min={checkIn || undefined}
            onChange={(e) => setCheckOut(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-3 text-sm"
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-muted-foreground">
            Guests
          </span>
          <input
            type="number"
            min={1}
            max={6}
            value={guests}
            onChange={(e) => setGuests(Number(e.target.value))}
            className="w-20 rounded-lg border border-border bg-background px-3 py-3 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={status === "loading"}
          className="self-end rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {status === "loading" ? "Searching…" : "Search"}
        </button>
      </form>

      {status === "unconfigured" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Search isn&apos;t available right now.{" "}
          <Link href="/contact" className="font-semibold text-primary hover:underline">
            Get in touch
          </Link>{" "}
          and we&apos;ll check dates for you.
        </p>
      )}

      {status === "error" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Something went wrong loading availability. Please try again.
        </p>
      )}

      {status === "ready" && (
        <ul className="mt-4 space-y-2">
          {results.map((result) => (
            <li
              key={result.slug}
              className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
            >
              <span>
                <span className="font-semibold">{result.name}</span>{" "}
                <span className="text-muted-foreground">
                  · sleeps {result.sleeps}
                </span>
              </span>
              {result.available ? (
                // A plain <a> forces a full page load into the property
                // page, so the Lodgify booking widget script (which only
                // scans the DOM for its target element once) runs fresh.
                <a
                  href={`/properties/${result.slug}`}
                  className="font-semibold text-primary hover:underline"
                >
                  View &amp; Book →
                </a>
              ) : (
                <span className="text-muted-foreground">Not available</span>
              )}
            </li>
          ))}
          {results.length === 0 && (
            <li className="text-sm text-muted-foreground">
              No properties match those guests.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
