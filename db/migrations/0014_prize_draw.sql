-- Annual free-night prize draw. Guests enter from their welcome guide with
-- the name on their Google review and their email; the owner checks each
-- review exists before it counts (status VERIFIED).
CREATE TABLE prize_draw_entries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_year     int NOT NULL CHECK (draw_year BETWEEN 2026 AND 2100),
  google_name   text NOT NULL CHECK (length(google_name) BETWEEN 1 AND 100),
  email         text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  property_slug text CHECK (property_slug ~ '^[a-z0-9-]+$'),
  status        text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VERIFIED', 'REJECTED')),
  reviewed_by   text,
  reviewed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Entering twice with the same details is one entry.
CREATE UNIQUE INDEX prize_draw_entries_once ON prize_draw_entries (draw_year, lower(email), lower(google_name));
CREATE INDEX prize_draw_entries_year ON prize_draw_entries (draw_year, created_at DESC);
