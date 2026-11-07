-- Cancelling a confirmed booking with a refund the owner has approved.
--
-- A moved booking keeps the cancellation terms that applied on the day it was
-- moved, so the day and the arrival date it had then are kept. Nothing sets
-- these yet: bookings can't be moved in the admin area.
ALTER TABLE reservations
  ADD COLUMN moved_at            timestamptz,
  ADD COLUMN arrival_when_moved  date,
  ADD CONSTRAINT reservations_moved_together CHECK ((moved_at IS NULL) = (arrival_when_moved IS NULL)),
  -- Releasing a cancelled booking in Lodgify, which releases it on the channels.
  --   DONE      Lodgify accepted it, or already had it cancelled
  --   FAILED    Lodgify refused or didn't answer: retry, or cancel it there by hand
  --   NOT_SENT  sending to Lodgify is off here, or it isn't clear the booking is there
  ADD COLUMN lodgify_cancel_status text CHECK (lodgify_cancel_status IN ('DONE', 'FAILED', 'NOT_SENT')),
  ADD COLUMN lodgify_cancel_error  text CHECK (length(lodgify_cancel_error) <= 500);

-- What the owner approved, worked out when they approved it. Retrying a failed
-- refund repeats these amounts rather than working them out again.
--   card_refunds  [{ paymentId, paymentIntentId, pence, refundedBefore, refundId }],
--                 refundId being set once Stripe has made that refund
CREATE TABLE cancellation_refunds (
  reservation_id  uuid PRIMARY KEY REFERENCES reservations (id),
  rule            text NOT NULL CHECK (rule IN ('FULL', 'HALF_OF_TOTAL', 'NONE', 'OLD_TERMS')),
  days_before     int NOT NULL,
  cancelled_on    date NOT NULL,
  total_pence     int NOT NULL,
  paid_pence      int NOT NULL,
  refund_pence    int NOT NULL CHECK (refund_pence BETWEEN 0 AND paid_pence),
  card_pence      int NOT NULL CHECK (card_pence >= 0),
  voucher_pence   int NOT NULL CHECK (voucher_pence >= 0),
  manual_pence    int NOT NULL CHECK (manual_pence >= 0),
  voucher_code    text,
  card_refunds    jsonb NOT NULL DEFAULT '[]',
  status          text NOT NULL CHECK (status IN ('PENDING', 'PROCESSING', 'FAILED', 'DONE')),
  claimed_at      timestamptz,
  failure_message text CHECK (length(failure_message) <= 500),
  email_guest     boolean NOT NULL,
  approved_by     text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CHECK (card_pence + voucher_pence + manual_pence = refund_pence)
);
