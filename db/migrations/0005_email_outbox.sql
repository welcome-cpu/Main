-- Outbox for transactional email. Emails are written in the same
-- transaction as the booking change that causes them, then sent and marked
-- SENT; failures are retried. dedupe_key makes each email happen once even
-- if the triggering event (e.g. a Stripe webhook) is delivered repeatedly.
CREATE TABLE emails (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id  uuid REFERENCES reservations(id) ON DELETE SET NULL,
  kind            text NOT NULL,
  dedupe_key      text NOT NULL UNIQUE,
  recipient       text NOT NULL,
  subject         text NOT NULL,
  html            text NOT NULL,
  text_body       text NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts        int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error      text,
  sent_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX emails_due ON emails (next_attempt_at) WHERE status IN ('PENDING', 'SENDING');
CREATE INDEX emails_reservation ON emails (reservation_id);
