import "server-only";
import type { Sql, Tx } from "@/lib/db/client";
import { db } from "@/lib/db/client";
import { isEmailConfigured, sendGraphMail } from "@/lib/email/graph";

export type OutgoingEmail = {
  reservationId: string | null;
  kind: string;
  /** Same key = same email; enqueuing it again does nothing. */
  dedupeKey: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
};

const MAX_ATTEMPTS = 6;

/**
 * Adds an email to the outbox. Call inside the transaction that made the
 * change it reports, so the email exists if and only if the change does.
 */
export async function enqueueEmail(sql: Sql | Tx, email: OutgoingEmail) {
  // Outside production, mark emails clearly so test bookings can't be
  // mistaken for real ones.
  const subject = process.env.VERCEL_ENV === "production" ? email.subject : `[TEST] ${email.subject}`;
  await sql`
    INSERT INTO emails (reservation_id, kind, dedupe_key, recipient, reply_to, subject, html, text_body)
    VALUES (${email.reservationId}, ${email.kind}, ${email.dedupeKey}, ${email.to}, ${email.replyTo ?? null},
            ${subject}, ${email.html}, ${email.text})
    ON CONFLICT (dedupe_key) DO NOTHING
  `;
}

type Sender = (message: { to: string; subject: string; html: string; replyTo?: string | null }) => Promise<void>;

/**
 * Sends due emails. Each one is claimed with SKIP LOCKED so overlapping runs
 * never send the same email twice. Failures back off and are retried.
 */
export async function processOutbox(options: { limit?: number; send?: Sender } = {}) {
  const send = options.send ?? (isEmailConfigured() ? sendGraphMail : null);
  if (!send) return { sent: 0, failed: 0, skipped: "email not configured" as const };

  const sql = db();
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < (options.limit ?? 20); i++) {
    const [email] = await sql<{ id: string; recipient: string; replyTo: string | null; subject: string; html: string; attempts: number }[]>`
      -- Claiming also pushes the retry time 10 minutes out, atomically, so a
      -- run that crashes mid-send is retried later but never concurrently.
      UPDATE emails SET status = 'SENDING', attempts = attempts + 1,
        next_attempt_at = now() + interval '10 minutes'
      WHERE id = (
        SELECT id FROM emails
        WHERE status IN ('PENDING', 'SENDING') AND next_attempt_at <= now()
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id, recipient, reply_to, subject, html, attempts
    `;
    if (!email) break;

    try {
      await send({ to: email.recipient, subject: email.subject, html: email.html, replyTo: email.replyTo });
      await sql`UPDATE emails SET status = 'SENT', sent_at = now(), last_error = NULL WHERE id = ${email.id}`;
      sent++;
    } catch (error) {
      failed++;
      const giveUp = email.attempts >= MAX_ATTEMPTS;
      await sql`
        UPDATE emails SET
          status = ${giveUp ? "FAILED" : "PENDING"},
          last_error = ${String((error as Error).message ?? error).slice(0, 500)},
          next_attempt_at = now() + make_interval(mins => ${Math.min(2 ** email.attempts, 120)})
        WHERE id = ${email.id}
      `;
    }
  }
  return { sent, failed };
}
