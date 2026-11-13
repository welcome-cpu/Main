-- Hot water on the same Hive receiver as Murray Cottage's heating: a standard
-- schedule of its own, put back and switched off along with the heating.

ALTER TABLE heating_controls ADD COLUMN standard_hot_water_schedule jsonb;

-- Nothing can be switched on with only half a standard saved.
UPDATE heating_controls SET enabled = false WHERE enabled AND standard_hot_water_schedule IS NULL;

ALTER TABLE heating_controls DROP CONSTRAINT heating_controls_check;
ALTER TABLE heating_controls ADD CONSTRAINT heating_controls_check
  CHECK (NOT enabled OR (standard_schedule IS NOT NULL AND standard_hot_water_schedule IS NOT NULL AND enabled_at IS NOT NULL));
