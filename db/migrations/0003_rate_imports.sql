-- History of nightly-price imports from Lodgify (read-only copies used
-- while the two systems run side by side).
CREATE TABLE rate_imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id    uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  trigger        text NOT NULL CHECK (trigger IN ('MANUAL', 'SCHEDULED')),
  triggered_by   text,
  started_at     timestamptz NOT NULL DEFAULT now(),
  finished_at    timestamptz,
  status         text NOT NULL CHECK (status IN ('RUNNING', 'OK', 'ERROR')),
  first_night    date,
  last_night     date,
  nights_written int,
  error          text
);
CREATE INDEX rate_imports_property ON rate_imports (property_id, started_at DESC);
