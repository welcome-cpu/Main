-- Hive heating control for Murray Cottage. Off until the owner switches it on
-- in admin, after saving the standard schedule.

CREATE TABLE heating_controls (
  property_id        uuid PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
  provider           text NOT NULL DEFAULT 'HIVE' CHECK (provider IN ('HIVE')),
  enabled            boolean NOT NULL DEFAULT false,
  -- When it was last switched on; changes before this don't count.
  enabled_at         timestamptz,
  -- The schedule every guest starts with (Hive's weekly format).
  standard_schedule  jsonb,
  schedule_saved_at  timestamptz,
  schedule_saved_by  text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT enabled OR (standard_schedule IS NOT NULL AND enabled_at IS NOT NULL))
);

-- One row per attempt to change the heating. The newest DONE or SKIPPED row is
-- what the heating was last set to; a FAILED row is retried on the next run.
CREATE TABLE heating_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  transition_key  text NOT NULL,
  action          text NOT NULL CHECK (action IN ('RESET', 'OFF')),
  due_at          timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('DONE', 'FAILED', 'SKIPPED')),
  error           text,
  trigger         text NOT NULL CHECK (trigger IN ('SCHEDULED', 'MANUAL')),
  actor           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX heating_actions_recent ON heating_actions (property_id, created_at DESC);

INSERT INTO heating_controls (property_id)
SELECT id FROM properties WHERE slug = 'murray-cottage';
