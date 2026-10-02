-- Direct booking system: core schema.
--
-- Conventions
--   * Money is integer pence. Never floats.
--   * Stay dates are plain DATEs in the property's local calendar (no times,
--     no timezones), so BST changes can never shift a booking by a day.
--   * Date ranges are half-open [start, end): a stay of 5–10 Aug occupies the
--     nights of the 5th..9th, so a 10 Aug checkout and a 10 Aug check-in never
--     conflict.
--   * Constraints that protect against double bookings live in the database,
--     not only in application code.

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Booking sources (channels). A lookup table rather than an enum so new
-- channels are a row insert, not a schema change.
-- ---------------------------------------------------------------------------
CREATE TABLE booking_sources (
  code        text PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]*$'),
  label       text NOT NULL,
  is_external boolean NOT NULL
);

INSERT INTO booking_sources (code, label, is_external) VALUES
  ('DIRECT',      'Direct (website)', false),
  ('MANUAL',      'Manual (owner entered)', false),
  ('AIRBNB',      'Airbnb', true),
  ('BOOKING_COM', 'Booking.com', true),
  ('LODGIFY',     'Lodgify', true),
  ('OTHER',       'Other', true);

-- ---------------------------------------------------------------------------
-- Properties: operational settings only. Marketing copy and photos stay in
-- lib/properties.ts, joined by slug.
-- ---------------------------------------------------------------------------
CREATE TABLE properties (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  name                    text NOT NULL,
  -- Whether the property can be booked directly. Off by default.
  is_active               boolean NOT NULL DEFAULT false,
  timezone                text NOT NULL DEFAULT 'Europe/London',
  currency                char(3) NOT NULL DEFAULT 'GBP',
  max_guests              int NOT NULL CHECK (max_guests > 0),
  max_pets                int NOT NULL DEFAULT 0 CHECK (max_pets >= 0),
  check_in_time           time NOT NULL DEFAULT '15:00',
  check_out_time          time NOT NULL DEFAULT '11:00',
  -- Nights kept empty after every stay for turnover (Murray Cottage: 1).
  turnover_nights         int NOT NULL DEFAULT 0 CHECK (turnover_nights BETWEEN 0 AND 7),
  -- Fallback nightly price when no rate rule or imported rate covers a night.
  base_nightly_pence      int NOT NULL CHECK (base_nightly_pence > 0),
  cleaning_fee_pence      int NOT NULL DEFAULT 0 CHECK (cleaning_fee_pence >= 0),
  -- One-off charge per stay when any pets are booked (not per pet).
  pet_fee_pence           int NOT NULL DEFAULT 0 CHECK (pet_fee_pence >= 0),
  default_min_nights      int NOT NULL DEFAULT 1 CHECK (default_min_nights >= 1),
  default_max_nights      int NOT NULL DEFAULT 28,
  advance_notice_hours    int NOT NULL DEFAULT 24 CHECK (advance_notice_hours >= 0),
  booking_window_days     int NOT NULL DEFAULT 365 CHECK (booking_window_days > 0),
  -- Payment terms: deposit_percent due at booking, the balance
  -- balance_due_days_before arrival. Bookings inside that window pay in full.
  deposit_percent         int NOT NULL DEFAULT 100 CHECK (deposit_percent BETWEEN 1 AND 100),
  balance_due_days_before int NOT NULL DEFAULT 7 CHECK (balance_due_days_before >= 0),
  -- Where nightly prices come from while running alongside Lodgify.
  rate_source             text NOT NULL DEFAULT 'MANUAL' CHECK (rate_source IN ('MANUAL', 'LODGIFY')),
  lodgify_property_id     int UNIQUE,
  lodgify_room_type_id    int,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CHECK (default_max_nights >= default_min_nights),
  CHECK (rate_source <> 'LODGIFY' OR (lodgify_property_id IS NOT NULL AND lodgify_room_type_id IS NOT NULL))
);
CREATE TRIGGER properties_updated_at BEFORE UPDATE ON properties
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Pricing.
-- Precedence for a night: active rate_rules (highest priority, then newest)
-- > nightly_rates > properties.base_nightly_pence.
-- ---------------------------------------------------------------------------

-- One row per property per night. Filled by the Lodgify rate import during
-- the parallel run (read-only copy), or by the admin.
CREATE TABLE nightly_rates (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  night       date NOT NULL,
  price_pence int NOT NULL CHECK (price_pence > 0),
  -- Stay-length limits that apply when this night is the arrival night.
  min_nights  int CHECK (min_nights >= 1),
  max_nights  int CHECK (max_nights >= 1),
  source      text NOT NULL CHECK (source IN ('LODGIFY_IMPORT', 'ADMIN')),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, night)
);

-- Admin-entered seasonal rules/overrides over a date range.
CREATE TABLE rate_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name        text NOT NULL,
  nights      daterange NOT NULL CHECK (NOT isempty(nights) AND NOT lower_inf(nights) AND NOT upper_inf(nights)),
  price_pence int CHECK (price_pence > 0),
  min_nights  int CHECK (min_nights >= 1),
  max_nights  int CHECK (max_nights >= 1),
  priority    int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (price_pence IS NOT NULL OR min_nights IS NOT NULL OR max_nights IS NOT NULL)
);
CREATE INDEX rate_rules_lookup ON rate_rules USING gist (property_id, nights) WHERE is_active;
CREATE TRIGGER rate_rules_updated_at BEFORE UPDATE ON rate_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Optional extras. property_id NULL means offered at every property.
CREATE TABLE extras (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  uuid REFERENCES properties(id) ON DELETE CASCADE,
  name         text NOT NULL,
  description  text,
  price_pence  int NOT NULL CHECK (price_pence >= 0),
  pricing_type text NOT NULL CHECK (pricing_type IN ('PER_STAY', 'PER_NIGHT', 'PER_GUEST', 'PER_GUEST_PER_NIGHT')),
  max_quantity int NOT NULL DEFAULT 1 CHECK (max_quantity >= 1),
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER extras_updated_at BEFORE UPDATE ON extras
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Discount codes. Discounts apply to the accommodation amount only.
CREATE TABLE discount_codes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code             text NOT NULL CHECK (code = upper(code) AND code ~ '^[A-Z0-9_-]{3,32}$'),
  property_id      uuid REFERENCES properties(id) ON DELETE CASCADE,
  discount_type    text NOT NULL CHECK (discount_type IN ('PERCENT', 'FIXED')),
  percent_off      numeric(5,2) CHECK (percent_off > 0 AND percent_off <= 100),
  amount_off_pence int CHECK (amount_off_pence > 0),
  min_nights       int CHECK (min_nights >= 1),
  -- Every night of the stay must fall inside stay_window, if set.
  stay_window      daterange,
  -- The booking must be made on a (property-local) date inside booking_window, if set.
  booking_window   daterange,
  max_redemptions  int CHECK (max_redemptions >= 1),
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((discount_type = 'PERCENT') = (percent_off IS NOT NULL)),
  CHECK ((discount_type = 'FIXED') = (amount_off_pence IS NOT NULL))
);
CREATE UNIQUE INDEX discount_codes_code ON discount_codes (code);
CREATE TRIGGER discount_codes_updated_at BEFORE UPDATE ON discount_codes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Guests.
-- ---------------------------------------------------------------------------
CREATE TABLE guests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name         text NOT NULL CHECK (length(first_name) BETWEEN 1 AND 100),
  last_name          text NOT NULL CHECK (length(last_name) BETWEEN 1 AND 100),
  email              text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  phone              text CHECK (length(phone) <= 40),
  country            char(2),
  stripe_customer_id text UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guests_email ON guests (lower(email));
CREATE TRIGGER guests_updated_at BEFORE UPDATE ON guests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Reservations, including temporary checkout holds (status = 'HOLD').
-- Keeping holds in the same table means a hold becoming a booking is a
-- single-row status change, and one constraint guards both.
-- ---------------------------------------------------------------------------
CREATE TABLE reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Human-readable, e.g. GC-7K3M9P (Crockford base32: no I, L, O, U).
  reference           text NOT NULL UNIQUE CHECK (reference ~ '^GC-[0-9A-HJKMNP-TV-Z]{6}$'),
  property_id         uuid NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  source              text NOT NULL REFERENCES booking_sources(code),
  status              text NOT NULL CHECK (status IN ('HOLD', 'CONFIRMED', 'CANCELLED', 'EXPIRED')),
  check_in            date NOT NULL,
  check_out           date NOT NULL,
  -- Copied from the property when the reservation is created, so changing
  -- the property setting later never silently alters existing bookings.
  turnover_nights     int NOT NULL DEFAULT 0 CHECK (turnover_nights BETWEEN 0 AND 7),
  stay                daterange GENERATED ALWAYS AS (daterange(check_in, check_out, '[)')) STORED,
  -- The nights this reservation takes out of inventory: the stay plus turnover.
  blocked             daterange GENERATED ALWAYS AS (daterange(check_in, check_out + turnover_nights, '[)')) STORED,
  adults              int NOT NULL CHECK (adults >= 1),
  children            int NOT NULL DEFAULT 0 CHECK (children >= 0),
  infants             int NOT NULL DEFAULT 0 CHECK (infants >= 0),
  pets                int NOT NULL DEFAULT 0 CHECK (pets >= 0),
  guest_id            uuid REFERENCES guests(id) ON DELETE RESTRICT,
  guest_message       text CHECK (length(guest_message) <= 2000),
  hold_expires_at     timestamptz,
  -- Final price snapshot, calculated by the server. All pence.
  currency            char(3) NOT NULL,
  accommodation_pence int NOT NULL CHECK (accommodation_pence >= 0),
  cleaning_fee_pence  int NOT NULL DEFAULT 0 CHECK (cleaning_fee_pence >= 0),
  pet_fee_pence       int NOT NULL DEFAULT 0 CHECK (pet_fee_pence >= 0),
  extras_pence        int NOT NULL DEFAULT 0 CHECK (extras_pence >= 0),
  discount_pence      int NOT NULL DEFAULT 0 CHECK (discount_pence >= 0),
  total_pence         int NOT NULL CHECK (total_pence >= 0),
  deposit_pence       int NOT NULL,
  balance_due_date    date,
  -- Per-night prices and the rules that produced them, for audit/display.
  price_breakdown     jsonb NOT NULL,
  discount_code_id    uuid REFERENCES discount_codes(id) ON DELETE RESTRICT,
  confirmed_at        timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_by          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CHECK (check_out > check_in),
  CHECK (total_pence = accommodation_pence + cleaning_fee_pence + pet_fee_pence + extras_pence - discount_pence),
  CHECK (deposit_pence BETWEEN 0 AND total_pence),
  CHECK (status <> 'HOLD' OR hold_expires_at IS NOT NULL),
  CHECK (status <> 'CONFIRMED' OR confirmed_at IS NOT NULL),
  CHECK (status <> 'CANCELLED' OR cancelled_at IS NOT NULL),
  CHECK (source <> 'DIRECT' OR guest_id IS NOT NULL),

  -- THE double-booking guard. Postgres refuses any two live (HOLD or
  -- CONFIRMED) reservations for the same property whose blocked nights
  -- overlap, regardless of what the application does.
  CONSTRAINT reservations_no_overlap
    EXCLUDE USING gist (property_id WITH =, blocked WITH &&)
    WHERE (status IN ('HOLD', 'CONFIRMED'))
);
CREATE INDEX reservations_property_dates ON reservations (property_id, check_in);
CREATE INDEX reservations_live_holds ON reservations (property_id, hold_expires_at) WHERE status = 'HOLD';
CREATE INDEX reservations_guest ON reservations (guest_id);
CREATE INDEX reservations_status_created ON reservations (status, created_at DESC);
CREATE TRIGGER reservations_updated_at BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE reservation_extras (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id   uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  extra_id         uuid REFERENCES extras(id) ON DELETE SET NULL,
  -- Snapshot so later edits to the extra never change past bookings.
  name             text NOT NULL,
  pricing_type     text NOT NULL,
  unit_price_pence int NOT NULL CHECK (unit_price_pence >= 0),
  quantity         int NOT NULL CHECK (quantity >= 1),
  total_pence      int NOT NULL CHECK (total_pence >= 0),
  UNIQUE (reservation_id, extra_id)
);

-- ---------------------------------------------------------------------------
-- Manual owner blocks.
-- ---------------------------------------------------------------------------
CREATE TABLE manual_blocks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  nights      daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[)')) STORED,
  reason      text CHECK (length(reason) <= 500),
  is_active   boolean NOT NULL DEFAULT true,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  removed_by  text,
  removed_at  timestamptz,
  CHECK (end_date > start_date),
  CHECK (is_active OR removed_at IS NOT NULL)
);
CREATE INDEX manual_blocks_active ON manual_blocks USING gist (property_id, nights) WHERE is_active;

-- ---------------------------------------------------------------------------
-- Payments. A reservation can have a deposit and a later balance payment.
-- ---------------------------------------------------------------------------
CREATE TABLE payments (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id             uuid NOT NULL REFERENCES reservations(id) ON DELETE RESTRICT,
  provider                   text NOT NULL DEFAULT 'STRIPE' CHECK (provider IN ('STRIPE', 'MANUAL')),
  kind                       text NOT NULL CHECK (kind IN ('DEPOSIT', 'BALANCE', 'FULL')),
  -- PENDING: checkout created. AUTHORISED: card authorised, not yet captured.
  -- SUCCEEDED: money captured.
  status                     text NOT NULL CHECK (status IN ('PENDING', 'AUTHORISED', 'SUCCEEDED', 'FAILED', 'CANCELLED')),
  amount_pence               int NOT NULL CHECK (amount_pence > 0),
  refunded_pence             int NOT NULL DEFAULT 0,
  currency                   char(3) NOT NULL,
  due_date                   date,
  stripe_checkout_session_id text UNIQUE,
  stripe_payment_intent_id   text UNIQUE,
  stripe_customer_id         text,
  stripe_payment_method_id   text,
  failure_code               text,
  failure_message            text,
  authorised_at              timestamptz,
  captured_at                timestamptz,
  failed_at                  timestamptz,
  cancelled_at               timestamptz,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CHECK (refunded_pence BETWEEN 0 AND amount_pence),
  CHECK (refunded_pence = 0 OR status = 'SUCCEEDED'),
  CHECK (status <> 'SUCCEEDED' OR captured_at IS NOT NULL)
);
-- At most one live payment of each kind per reservation.
CREATE UNIQUE INDEX payments_one_live_per_kind ON payments (reservation_id, kind)
  WHERE status NOT IN ('FAILED', 'CANCELLED');
CREATE INDEX payments_reservation ON payments (reservation_id);
CREATE INDEX payments_due ON payments (due_date) WHERE status = 'PENDING' AND kind = 'BALANCE';
CREATE TRIGGER payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Every Stripe webhook event we have processed. Primary key on the Stripe
-- event id makes duplicate deliveries a no-op. Payloads are not stored.
CREATE TABLE stripe_events (
  event_id         text PRIMARY KEY,
  type             text NOT NULL,
  livemode         boolean NOT NULL,
  received_at      timestamptz NOT NULL DEFAULT now(),
  processed_at     timestamptz,
  processing_error text
);

-- Paid / balance / payment status per reservation, derived from payments so
-- it can never drift out of step.
CREATE VIEW reservation_financials AS
SELECT
  r.id AS reservation_id,
  r.total_pence,
  COALESCE(SUM(p.amount_pence - p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0)::int AS paid_pence,
  COALESCE(SUM(p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0)::int AS refunded_pence,
  (r.total_pence - COALESCE(SUM(p.amount_pence - p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0))::int AS balance_pence,
  CASE
    WHEN COALESCE(SUM(p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0) > 0
      AND COALESCE(SUM(p.amount_pence - p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0) = 0 THEN 'REFUNDED'
    WHEN COALESCE(SUM(p.amount_pence - p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0) >= r.total_pence THEN 'PAID'
    WHEN COALESCE(SUM(p.amount_pence - p.refunded_pence) FILTER (WHERE p.status = 'SUCCEEDED'), 0) > 0 THEN 'PART_PAID'
    WHEN bool_or(p.status = 'AUTHORISED') THEN 'AUTHORISED'
    ELSE 'UNPAID'
  END AS payment_status
FROM reservations r
LEFT JOIN payments p ON p.reservation_id = r.id
GROUP BY r.id;

-- ---------------------------------------------------------------------------
-- External calendars (iCal import).
-- ---------------------------------------------------------------------------
CREATE TABLE calendar_feeds (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source               text NOT NULL REFERENCES booking_sources(code),
  name                 text NOT NULL,
  -- Contains an access token: server-side only, never sent to the browser.
  url                  text NOT NULL CHECK (url ~ '^https://'),
  is_active            boolean NOT NULL DEFAULT true,
  -- Whether the property's turnover nights also apply after these events.
  apply_turnover       boolean NOT NULL DEFAULT true,
  last_attempted_at    timestamptz,
  last_success_at      timestamptz,
  last_status          text CHECK (last_status IN ('OK', 'ERROR')),
  last_error           text,
  consecutive_failures int NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, url),
  UNIQUE (id, property_id)
);
CREATE TRIGGER calendar_feeds_updated_at BEFORE UPDATE ON calendar_feeds
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE external_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id       uuid NOT NULL,
  property_id   uuid NOT NULL,
  uid           text NOT NULL,
  start_date    date NOT NULL,
  end_date      date NOT NULL,
  nights        daterange GENERATED ALWAYS AS (daterange(start_date, end_date, '[)')) STORED,
  -- Private (often contains a guest name). Never exposed publicly.
  summary       text,
  status        text NOT NULL CHECK (status IN ('ACTIVE', 'REMOVED')),
  content_hash  text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  removed_at    timestamptz,
  CHECK (end_date > start_date),
  CHECK ((status = 'REMOVED') = (removed_at IS NOT NULL)),
  -- Idempotent import: one row per event per feed, updated in place.
  UNIQUE (feed_id, uid),
  -- Guarantees property_id always matches the feed's property.
  FOREIGN KEY (feed_id, property_id) REFERENCES calendar_feeds (id, property_id) ON DELETE CASCADE
);
-- Deliberately NO exclusion constraint: imported events are facts about other
-- channels. If one overlaps a direct booking, rejecting it would hide a real
-- double booking; instead it is stored, blocks availability, and is flagged.
CREATE INDEX external_events_active ON external_events USING gist (property_id, nights) WHERE status = 'ACTIVE';

CREATE TABLE calendar_sync_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id        uuid NOT NULL REFERENCES calendar_feeds(id) ON DELETE CASCADE,
  trigger        text NOT NULL CHECK (trigger IN ('MANUAL', 'SCHEDULED')),
  triggered_by   text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('RUNNING', 'OK', 'ERROR')),
  http_status    int,
  events_seen    int,
  events_added   int,
  events_updated int,
  events_removed int,
  error          text
);
CREATE INDEX calendar_sync_runs_feed ON calendar_sync_runs (feed_id, started_at DESC);

-- Our own iCal export feeds (one per property per consumer, e.g. Airbnb).
-- Only a SHA-256 hash of the secret URL token is stored.
CREATE TABLE calendar_exports (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id      uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label            text NOT NULL,
  token_sha256     bytea NOT NULL UNIQUE CHECK (length(token_sha256) = 32),
  is_active        boolean NOT NULL DEFAULT true,
  last_accessed_at timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz
);

-- ---------------------------------------------------------------------------
-- Admin users, audit log, rate limiting.
-- ---------------------------------------------------------------------------
CREATE TABLE admin_users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL,
  -- Microsoft Entra object id, pinned on first sign-in.
  entra_object_id uuid UNIQUE,
  display_name    text,
  role            text NOT NULL DEFAULT 'OWNER' CHECK (role IN ('OWNER', 'STAFF')),
  is_active       boolean NOT NULL DEFAULT true,
  last_login_at   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX admin_users_email ON admin_users (lower(email));

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_type  text NOT NULL CHECK (actor_type IN ('ADMIN', 'GUEST', 'SYSTEM', 'STRIPE')),
  actor       text,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  details     jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX audit_log_occurred ON audit_log (occurred_at DESC);

-- The audit log is append-only.
CREATE FUNCTION audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();

-- Fixed-window counters for public endpoints. Unlogged: losing counts on a
-- crash is harmless and makes writes cheaper.
CREATE UNLOGGED TABLE rate_limits (
  key          text NOT NULL,
  window_start timestamptz NOT NULL,
  count        int NOT NULL,
  PRIMARY KEY (key, window_start)
);
