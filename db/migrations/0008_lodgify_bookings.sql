-- Read-only copy of bookings held in Lodgify (Airbnb, Booking.com, Lodgify's
-- own site and manual entries), kept for the admin area: who is staying on the
-- dates the calendar feeds block, and where guests come from.
--
-- Deliberately minimal: no email, phone or payment details are stored. The
-- country is worked out from the guest's phone dialling code at import time,
-- because the channels don't pass a country or address on to Lodgify.
CREATE TABLE lodgify_bookings (
  lodgify_booking_id bigint PRIMARY KEY,
  property_id        uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channel            text NOT NULL CHECK (length(channel) <= 50),
  status             text NOT NULL CHECK (length(status) <= 30),
  arrival            date NOT NULL,
  departure          date NOT NULL CHECK (departure > arrival),
  guest_name         text CHECK (length(guest_name) <= 200),
  country            char(2) CHECK (country ~ '^[A-Z]{2}$'),
  adults             int NOT NULL DEFAULT 0 CHECK (adults >= 0),
  children           int NOT NULL DEFAULT 0 CHECK (children >= 0),
  infants            int NOT NULL DEFAULT 0 CHECK (infants >= 0),
  pets               int NOT NULL DEFAULT 0 CHECK (pets >= 0),
  imported_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lodgify_bookings_stay ON lodgify_bookings (property_id, arrival, departure);

-- History of booking imports, like rate_imports.
CREATE TABLE lodgify_booking_imports (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger           text NOT NULL CHECK (trigger IN ('MANUAL', 'SCHEDULED')),
  triggered_by      text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  status            text NOT NULL CHECK (status IN ('RUNNING', 'OK', 'ERROR')),
  bookings_imported int,
  error             text
);
CREATE INDEX lodgify_booking_imports_started ON lodgify_booking_imports (started_at DESC);
