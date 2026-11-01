-- Guests' home addresses, sending direct bookings on to Lodgify, and
-- newsletter sign-ups from checkout.

ALTER TABLE guests
  ADD COLUMN address_line1 text CHECK (length(address_line1) <= 200),
  ADD COLUMN address_line2 text CHECK (length(address_line2) <= 200),
  ADD COLUMN city          text CHECK (length(city) <= 100),
  ADD COLUMN postal_code   text CHECK (length(postal_code) <= 20);

-- Each confirmed direct booking is created in Lodgify once its first payment
-- is taken, so Lodgify can send its guest emails and show it alongside the
-- channel bookings.
--   OFF      sending switched off for this deployment when it was confirmed
--   PENDING  waiting to be sent
--   SENDING  being sent right now
--   PUSHED   created in Lodgify (lodgify_booking_id)
--   FAILED   Lodgify refused it, so nothing was created there
--   CHECK    no clear answer from Lodgify: it may or may not have been created
-- FAILED and CHECK are never retried automatically, so a booking can't be
-- created in Lodgify twice; the owner retries from the admin area.
ALTER TABLE reservations
  ADD COLUMN lodgify_booking_id      bigint UNIQUE,
  ADD COLUMN lodgify_push_status     text CHECK (lodgify_push_status IN ('OFF', 'PENDING', 'SENDING', 'PUSHED', 'FAILED', 'CHECK')),
  ADD COLUMN lodgify_push_error      text CHECK (length(lodgify_push_error) <= 1000),
  ADD COLUMN lodgify_push_started_at timestamptz,
  ADD COLUMN lodgify_pushed_at       timestamptz,
  ADD COLUMN newsletter_opt_in       boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT reservations_lodgify_pushed CHECK (lodgify_push_status <> 'PUSHED' OR lodgify_booking_id IS NOT NULL);
CREATE INDEX reservations_lodgify_push ON reservations (lodgify_push_status)
  WHERE lodgify_push_status IN ('PENDING', 'SENDING', 'FAILED', 'CHECK');

-- People to add to the EmailOctopus mailing list, sent in the background
-- and retried until EmailOctopus accepts them.
CREATE TABLE newsletter_signups (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email          text NOT NULL CHECK (length(email) <= 254),
  first_name     text CHECK (length(first_name) <= 100),
  last_name      text CHECK (length(last_name) <= 100),
  source         text NOT NULL CHECK (length(source) <= 50),
  reservation_id uuid UNIQUE REFERENCES reservations(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'DONE', 'FAILED')),
  attempts       int NOT NULL DEFAULT 0,
  last_error     text CHECK (length(last_error) <= 1000),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  done_at        timestamptz
);
CREATE INDEX newsletter_signups_pending ON newsletter_signups (created_at) WHERE status = 'PENDING';
CREATE TRIGGER newsletter_signups_updated_at BEFORE UPDATE ON newsletter_signups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
