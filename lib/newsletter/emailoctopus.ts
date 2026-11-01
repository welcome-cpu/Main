import "server-only";
import type { Sql, Tx } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { logError } from "@/lib/log";

// Mailing list sign-ups go to EmailOctopus in the background, so a slow or
// failing EmailOctopus never holds up a booking. Each is retried with a
// growing gap until EmailOctopus accepts it.

const MAX_ATTEMPTS = 8;

export function isNewsletterConfigured() {
  return Boolean(process.env.EMAILOCTOPUS_API_KEY && process.env.EMAILOCTOPUS_LIST_ID);
}

/** Queues the guest for the mailing list if they ticked the box at checkout. */
export async function queueBookingNewsletterSignup(sql: Sql | Tx, reservationId: string) {
  await sql`
    INSERT INTO newsletter_signups (email, first_name, last_name, source, reservation_id)
    SELECT g.email, g.first_name, g.last_name, 'booking', r.id
    FROM reservations r JOIN guests g ON g.id = r.guest_id
    WHERE r.id = ${reservationId} AND r.newsletter_opt_in
    ON CONFLICT (reservation_id) DO NOTHING
  `;
}

/**
 * Adds or updates the contact on the list as subscribed. They ticked the
 * box themselves, so that's their consent, including after unsubscribing
 * in the past.
 */
async function subscribe(signup: { email: string; firstName: string | null; lastName: string | null; source: string }) {
  const res = await fetch(
    `https://api.emailoctopus.com/lists/${encodeURIComponent(process.env.EMAILOCTOPUS_LIST_ID!)}/contacts`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.EMAILOCTOPUS_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        email_address: signup.email,
        fields: { FirstName: signup.firstName, LastName: signup.lastName },
        tags: { [`website-${signup.source}`]: true },
        status: "subscribed",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (res.ok) return null;
  let detail = "";
  try {
    const body = (await res.json()) as { detail?: unknown; title?: unknown };
    detail = String(body.detail ?? body.title ?? "");
  } catch {}
  return `EmailOctopus returned HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ""}`;
}

/** Sends waiting sign-ups to EmailOctopus. Does nothing until it's set up. */
export async function processNewsletterSignups(limit = 20) {
  if (!isNewsletterConfigured()) return { sent: 0, failed: 0 };
  const sql = db();
  // Retries wait 5, 10, 20… minutes, so a long outage doesn't use them up.
  const due = await sql<{ id: string; email: string; firstName: string | null; lastName: string | null; source: string; attempts: number }[]>`
    UPDATE newsletter_signups SET attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM newsletter_signups
      WHERE status = 'PENDING'
        AND (attempts = 0 OR updated_at < now() - make_interval(mins => 5 * power(2, attempts - 1)::int))
      ORDER BY created_at LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, email, first_name, last_name, source, attempts
  `;
  let sent = 0;
  let failed = 0;
  for (const s of due) {
    let error: string | null;
    try {
      error = await subscribe(s);
    } catch (e) {
      logError("EmailOctopus sign-up failed", e);
      error = "Couldn't reach EmailOctopus.";
    }
    if (!error) {
      sent++;
      await sql`UPDATE newsletter_signups SET status = 'DONE', done_at = now(), last_error = NULL WHERE id = ${s.id}`;
    } else {
      failed++;
      await sql`
        UPDATE newsletter_signups SET last_error = ${error},
          status = ${s.attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING"}
        WHERE id = ${s.id}
      `;
    }
  }
  return { sent, failed };
}
