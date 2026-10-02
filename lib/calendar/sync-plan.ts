// Decides how a freshly downloaded feed changes our stored copy of it.
// Pure logic, separate from the database, so every case can be tested.

import { createHash } from "node:crypto";
import type { ParsedEvent } from "@/lib/calendar/ics-parse";

export type StoredEvent = {
  id: string;
  uid: string;
  status: "ACTIVE" | "REMOVED";
  contentHash: string;
  endDate: string;
};

export type IncomingEvent = Omit<ParsedEvent, "cancelled"> & { contentHash: string };

export type SyncPlan = {
  inserts: IncomingEvent[];
  /** Changed events, and previously removed events that reappeared. */
  updates: (IncomingEvent & { id: string })[];
  /** Stored ACTIVE events no longer in the feed (or now cancelled). */
  removals: string[];
  unchanged: number;
};

export type PlanResult = { ok: true; plan: SyncPlan } | { ok: false; reason: string };

// A feed that suddenly loses most of its future bookings is far more likely
// to be broken than genuinely emptied, so those syncs are refused rather
// than freeing up dates that are actually booked.
const MIN_FUTURE_EVENTS_FOR_EMPTY_CHECK = 3;
const MASS_REMOVAL_MIN = 5;
const MASS_REMOVAL_SHARE = 0.5;

export function contentHash(e: Pick<ParsedEvent, "startDate" | "endDate" | "summary">) {
  return createHash("sha256")
    .update(`${e.startDate}|${e.endDate}|${e.summary ?? ""}`)
    .digest("hex");
}

/**
 * @param today property-local date (YYYY-MM-DD); events ending on or before
 *   it are in the past and never count towards the safety checks.
 */
export function planSync(stored: StoredEvent[], parsed: ParsedEvent[], today: string): PlanResult {
  const incoming = new Map<string, IncomingEvent>();
  for (const e of parsed) {
    if (e.cancelled) continue;
    incoming.set(e.uid, {
      uid: e.uid,
      startDate: e.startDate,
      endDate: e.endDate,
      summary: e.summary,
      contentHash: contentHash(e),
    });
  }

  const byUid = new Map(stored.map((s) => [s.uid, s]));
  const plan: SyncPlan = { inserts: [], updates: [], removals: [], unchanged: 0 };

  for (const event of incoming.values()) {
    const existing = byUid.get(event.uid);
    if (!existing) plan.inserts.push(event);
    else if (existing.status === "REMOVED" || existing.contentHash !== event.contentHash)
      plan.updates.push({ ...event, id: existing.id });
    else plan.unchanged++;
  }

  for (const s of stored) {
    if (s.status === "ACTIVE" && !incoming.has(s.uid)) plan.removals.push(s.id);
  }

  const activeFuture = stored.filter((s) => s.status === "ACTIVE" && s.endDate > today);
  const incomingFuture = [...incoming.values()].filter((e) => e.endDate > today);
  const removedFuture = activeFuture.filter((s) => !incoming.has(s.uid));

  if (incomingFuture.length === 0 && activeFuture.length >= MIN_FUTURE_EVENTS_FOR_EMPTY_CHECK) {
    return {
      ok: false,
      reason: `The feed returned no current bookings, but ${activeFuture.length} are on record. Kept the existing bookings in case the feed is broken.`,
    };
  }
  if (
    removedFuture.length >= MASS_REMOVAL_MIN &&
    removedFuture.length > activeFuture.length * MASS_REMOVAL_SHARE
  ) {
    return {
      ok: false,
      reason: `The feed dropped ${removedFuture.length} of ${activeFuture.length} upcoming bookings at once. Kept them in case the feed is broken.`,
    };
  }

  return { ok: true, plan };
}
