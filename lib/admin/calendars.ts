import "server-only";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import type { AdminUser } from "@/lib/admin/users";

export type FeedSummary = {
  id: string;
  propertyId: string;
  propertyName: string;
  source: string;
  sourceLabel: string;
  name: string;
  /** Host only; the full URL contains an access token and stays server-side. */
  urlHost: string;
  isActive: boolean;
  applyTurnover: boolean;
  lastAttemptedAt: Date | null;
  lastSuccessAt: Date | null;
  lastStatus: "OK" | "ERROR" | null;
  lastError: string | null;
  consecutiveFailures: number;
  activeEvents: number;
  upcomingEvents: number;
};

export type SyncRun = {
  id: string;
  feedName: string;
  propertyName: string;
  trigger: "MANUAL" | "SCHEDULED";
  triggeredBy: string | null;
  startedAt: Date;
  finishedAt: Date | null;
  status: "RUNNING" | "OK" | "ERROR";
  eventsSeen: number | null;
  eventsAdded: number | null;
  eventsUpdated: number | null;
  eventsRemoved: number | null;
  error: string | null;
};

export type ImportedEvent = {
  id: string;
  propertyName: string;
  sourceLabel: string;
  feedName: string;
  feedActive: boolean;
  startDate: string;
  endDate: string;
  summary: string | null;
};

export type Conflict = {
  eventId: string;
  propertyName: string;
  feedName: string;
  eventStart: string;
  eventEnd: string;
  reservationReference: string;
  reservationCheckIn: string;
  reservationCheckOut: string;
  /**
   * Same dates exactly: almost always our own booking coming back from a
   * channel that imports our export feed, rather than a real double booking.
   */
  exactMatch: boolean;
};

export async function listFeeds(): Promise<FeedSummary[]> {
  return db()<FeedSummary[]>`
    SELECT f.id, f.property_id, p.name AS property_name, f.source, s.label AS source_label,
           f.name, substring(f.url from '^https://([^/]+)') AS url_host,
           f.is_active, f.apply_turnover, f.last_attempted_at, f.last_success_at,
           f.last_status, f.last_error, f.consecutive_failures,
           count(e.id) FILTER (WHERE e.status = 'ACTIVE')::int AS active_events,
           count(e.id) FILTER (WHERE e.status = 'ACTIVE' AND e.end_date > current_date)::int AS upcoming_events
    FROM calendar_feeds f
    JOIN properties p ON p.id = f.property_id
    JOIN booking_sources s ON s.code = f.source
    LEFT JOIN external_events e ON e.feed_id = f.id
    GROUP BY f.id, p.name, s.label
    ORDER BY p.name, f.created_at
  `;
}

export async function listRecentRuns(limit = 25): Promise<SyncRun[]> {
  return db()<SyncRun[]>`
    SELECT r.id, f.name AS feed_name, p.name AS property_name, r.trigger, r.triggered_by,
           r.started_at, r.finished_at, r.status, r.events_seen, r.events_added,
           r.events_updated, r.events_removed, r.error
    FROM calendar_sync_runs r
    JOIN calendar_feeds f ON f.id = r.feed_id
    JOIN properties p ON p.id = f.property_id
    ORDER BY r.started_at DESC
    LIMIT ${limit}
  `;
}

export async function listUpcomingImportedEvents(limit = 200): Promise<ImportedEvent[]> {
  return db()<ImportedEvent[]>`
    SELECT e.id, p.name AS property_name, s.label AS source_label, f.name AS feed_name,
           f.is_active AS feed_active, e.start_date, e.end_date, e.summary
    FROM external_events e
    JOIN calendar_feeds f ON f.id = e.feed_id
    JOIN properties p ON p.id = e.property_id
    JOIN booking_sources s ON s.code = f.source
    WHERE e.status = 'ACTIVE' AND e.end_date >= (now() AT TIME ZONE p.timezone)::date
    ORDER BY e.start_date, p.name
    LIMIT ${limit}
  `;
}

/**
 * Imported events that overlap a live reservation taken in this system:
 * a likely double booking that needs a human to sort out.
 */
export async function listConflicts(): Promise<Conflict[]> {
  return db()<Conflict[]>`
    SELECT e.id AS event_id, p.name AS property_name, f.name AS feed_name,
           e.start_date AS event_start, e.end_date AS event_end,
           r.reference AS reservation_reference,
           r.check_in AS reservation_check_in, r.check_out AS reservation_check_out,
           (e.start_date = r.check_in AND e.end_date = r.check_out) AS exact_match
    FROM external_events e
    JOIN calendar_feeds f ON f.id = e.feed_id AND f.is_active
    JOIN properties p ON p.id = e.property_id
    JOIN reservations r ON r.property_id = e.property_id
     AND r.status IN ('HOLD', 'CONFIRMED')
     AND r.stay && e.nights
    WHERE e.status = 'ACTIVE'
    ORDER BY e.start_date
  `;
}

export async function createFeed(
  admin: AdminUser,
  input: { propertyId: string; source: string; name: string; url: string; applyTurnover: boolean }
): Promise<{ id: string } | { error: string }> {
  return db().begin(async (tx) => {
    const [property] = await tx`SELECT 1 FROM properties WHERE id = ${input.propertyId}`;
    if (!property) return { error: "Unknown property." };
    const [dupe] = await tx`
      SELECT 1 FROM calendar_feeds WHERE property_id = ${input.propertyId} AND url = ${input.url}
    `;
    if (dupe) return { error: "That calendar is already added for this property." };

    const [row] = await tx<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url, apply_turnover)
      VALUES (${input.propertyId}, ${input.source}, ${input.name}, ${input.url}, ${input.applyTurnover})
      RETURNING id
    `;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "calendar_feed.created",
      entityType: "calendar_feed",
      entityId: row.id,
      propertyId: input.propertyId,
      // The URL is deliberately not logged: it contains an access token.
      details: { name: input.name, source: input.source, applyTurnover: input.applyTurnover },
    });
    return { id: row.id };
  });
}

export async function setFeedActive(admin: AdminUser, feedId: string, isActive: boolean) {
  await db().begin(async (tx) => {
    const [row] = await tx<{ propertyId: string; name: string }[]>`
      UPDATE calendar_feeds SET is_active = ${isActive} WHERE id = ${feedId}
      RETURNING property_id, name
    `;
    if (!row) return;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: isActive ? "calendar_feed.enabled" : "calendar_feed.disabled",
      entityType: "calendar_feed",
      entityId: feedId,
      propertyId: row.propertyId,
      details: { name: row.name },
    });
  });
}

/** Deletes a feed and its imported events. Only allowed once it's disabled. */
export async function deleteFeed(admin: AdminUser, feedId: string): Promise<{ error?: string }> {
  return db().begin(async (tx) => {
    const [row] = await tx<{ propertyId: string; name: string; isActive: boolean }[]>`
      SELECT property_id, name, is_active FROM calendar_feeds WHERE id = ${feedId} FOR UPDATE
    `;
    if (!row) return {};
    if (row.isActive) return { error: "Disable the calendar before deleting it." };

    await tx`DELETE FROM calendar_feeds WHERE id = ${feedId}`;
    await recordAudit(tx, {
      actorType: "ADMIN",
      actor: admin.email,
      action: "calendar_feed.deleted",
      entityType: "calendar_feed",
      entityId: feedId,
      propertyId: row.propertyId,
      details: { name: row.name },
    });
    return {};
  });
}
