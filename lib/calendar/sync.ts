import "server-only";
import { recordAudit } from "@/lib/audit";
import { fetchFeed, FeedFetchError } from "@/lib/calendar/fetch-feed";
import { IcsParseError, parseIcs } from "@/lib/calendar/ics-parse";
import { planSync, type StoredEvent } from "@/lib/calendar/sync-plan";
import { db } from "@/lib/db/client";
import { todayInZone } from "@/lib/dates";

export type SyncTrigger = "MANUAL" | "SCHEDULED";

export type SyncOutcome = {
  feedId: string;
  feedName: string;
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  warnings: string[];
  error?: string;
};

class SyncRefused extends Error {}

type FeedRow = {
  id: string;
  name: string;
  url: string;
  source: string;
  propertyId: string;
  timezone: string;
};

/**
 * Imports one external calendar feed. Safe to run repeatedly and
 * concurrently: events are matched by UID and updated in place, and a
 * per-feed lock serialises overlapping runs. Only external_events is ever
 * written, so an import can never alter a direct reservation. If anything
 * fails, the previously imported events are left exactly as they were.
 */
export async function syncFeed(
  feedId: string,
  trigger: SyncTrigger,
  actor: string | null = null
): Promise<SyncOutcome> {
  const sql = db();
  const [feed] = await sql<FeedRow[]>`
    SELECT f.id, f.name, f.url, f.source, f.property_id, p.timezone
    FROM calendar_feeds f JOIN properties p ON p.id = f.property_id
    WHERE f.id = ${feedId}
  `;
  if (!feed) throw new Error("Calendar feed not found");

  const [run] = await sql<{ id: string }[]>`
    INSERT INTO calendar_sync_runs (feed_id, trigger, triggered_by, status)
    VALUES (${feed.id}, ${trigger}, ${actor}, 'RUNNING')
    RETURNING id
  `;
  await sql`UPDATE calendar_feeds SET last_attempted_at = now() WHERE id = ${feed.id}`;

  let httpStatus: number | null = null;
  let eventsSeen = 0;
  let warnings: string[] = [];

  try {
    const fetched = await fetchFeed(feed.url);
    httpStatus = fetched.httpStatus;
    const parsed = parseIcs(fetched.text, feed.timezone);
    warnings = parsed.warnings;
    eventsSeen = parsed.events.length;

    const counts = await sql.begin(async (tx) => {
      // Serialise concurrent syncs of the same feed.
      await tx`SELECT pg_advisory_xact_lock(hashtext(${"calendar_feed:" + feed.id}))`;

      const stored = await tx<StoredEvent[]>`
        SELECT id, uid, status, content_hash, end_date
        FROM external_events WHERE feed_id = ${feed.id}
      `;
      const result = planSync(stored, parsed.events, todayInZone(feed.timezone));
      if (!result.ok) throw new SyncRefused(result.reason);
      const { plan } = result;

      for (const e of [...plan.inserts, ...plan.updates]) {
        await tx`
          INSERT INTO external_events
            (feed_id, property_id, uid, start_date, end_date, summary, status, content_hash)
          VALUES
            (${feed.id}, ${feed.propertyId}, ${e.uid}, ${e.startDate}, ${e.endDate},
             ${e.summary}, 'ACTIVE', ${e.contentHash})
          ON CONFLICT (feed_id, uid) DO UPDATE SET
            start_date = EXCLUDED.start_date,
            end_date = EXCLUDED.end_date,
            summary = EXCLUDED.summary,
            status = 'ACTIVE',
            removed_at = NULL,
            content_hash = EXCLUDED.content_hash,
            last_seen_at = now()
        `;
      }

      const seenUids = parsed.events.filter((e) => !e.cancelled).map((e) => e.uid);
      if (seenUids.length > 0) {
        await tx`
          UPDATE external_events SET last_seen_at = now()
          WHERE feed_id = ${feed.id} AND uid = ANY(${seenUids})
        `;
      }
      if (plan.removals.length > 0) {
        await tx`
          UPDATE external_events SET status = 'REMOVED', removed_at = now()
          WHERE id = ANY(${plan.removals}) AND status = 'ACTIVE'
        `;
      }

      const counts = {
        added: plan.inserts.length,
        updated: plan.updates.length,
        removed: plan.removals.length,
      };

      await tx`
        UPDATE calendar_sync_runs SET
          status = 'OK', finished_at = now(), http_status = ${httpStatus},
          events_seen = ${eventsSeen}, events_added = ${counts.added},
          events_updated = ${counts.updated}, events_removed = ${counts.removed},
          error = ${warnings.length ? warnings.slice(0, 20).join("\n") : null}
        WHERE id = ${run.id}
      `;
      await tx`
        UPDATE calendar_feeds SET
          last_status = 'OK', last_success_at = now(), last_error = NULL, consecutive_failures = 0
        WHERE id = ${feed.id}
      `;
      if (counts.added + counts.updated + counts.removed > 0) {
        await recordAudit(tx, {
          actorType: actor ? "ADMIN" : "SYSTEM",
          actor,
          action: "calendar.imported",
          entityType: "calendar_feed",
          entityId: feed.id,
          propertyId: feed.propertyId,
          details: { feed: feed.name, source: feed.source, trigger, ...counts },
        });
      }
      return counts;
    });

    return { feedId: feed.id, feedName: feed.name, ok: true, ...counts, warnings };
  } catch (error) {
    const message = describeSyncError(error);
    await sql.begin(async (tx) => {
      await tx`
        UPDATE calendar_sync_runs SET
          status = 'ERROR', finished_at = now(), http_status = ${httpStatus},
          events_seen = ${eventsSeen}, error = ${message}
        WHERE id = ${run.id}
      `;
      await tx`
        UPDATE calendar_feeds SET
          last_status = 'ERROR', last_error = ${message},
          consecutive_failures = consecutive_failures + 1
        WHERE id = ${feed.id}
      `;
      await recordAudit(tx, {
        actorType: actor ? "ADMIN" : "SYSTEM",
        actor,
        action: "calendar.sync_failed",
        entityType: "calendar_feed",
        entityId: feed.id,
        propertyId: feed.propertyId,
        details: { feed: feed.name, source: feed.source, trigger, error: message },
      });
    });
    return {
      feedId: feed.id,
      feedName: feed.name,
      ok: false,
      added: 0,
      updated: 0,
      removed: 0,
      warnings,
      error: message,
    };
  }
}

/** Syncs every active feed, one at a time. Used by the scheduled job. */
export async function syncAllFeeds(trigger: SyncTrigger, actor: string | null = null) {
  const feeds = await db()<{ id: string }[]>`
    SELECT id FROM calendar_feeds WHERE is_active ORDER BY created_at
  `;
  const outcomes: SyncOutcome[] = [];
  for (const f of feeds) outcomes.push(await syncFeed(f.id, trigger, actor));
  return outcomes;
}

function describeSyncError(error: unknown): string {
  if (error instanceof FeedFetchError || error instanceof IcsParseError || error instanceof SyncRefused) {
    return error.message;
  }
  // Unexpected: log the detail server-side, store only a generic message.
  console.error("Calendar sync failed unexpectedly", error);
  return "Unexpected error during sync. See the server logs.";
}
