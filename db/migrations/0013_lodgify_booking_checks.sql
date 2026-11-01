-- Bookings we've sent to Lodgify can be cancelled or changed there, which our
-- site wouldn't otherwise know. They're compared with Lodgify regularly and
-- before the balance is charged.
--   lodgify_mismatch  CANCELLED (cancelled, declined or deleted in Lodgify)
--                     or CHANGED (different dates or chalet in Lodgify)
-- A flagged booking's balance isn't charged until the owner either cancels
-- it here or chooses to keep it (lodgify_mismatch_ignored).
ALTER TABLE reservations
  ADD COLUMN lodgify_checked_at       timestamptz,
  ADD COLUMN lodgify_mismatch         text CHECK (lodgify_mismatch IN ('CANCELLED', 'CHANGED')),
  ADD COLUMN lodgify_mismatch_detail  text CHECK (length(lodgify_mismatch_detail) <= 500),
  ADD COLUMN lodgify_mismatch_ignored boolean NOT NULL DEFAULT false;
CREATE INDEX reservations_lodgify_check ON reservations (lodgify_checked_at NULLS FIRST)
  WHERE status = 'CONFIRMED' AND lodgify_booking_id IS NOT NULL;
