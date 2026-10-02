-- Initial property settings, taken from the live Lodgify configuration on
-- 2026-10-02. Both start with is_active = false: nothing is directly
-- bookable until it is switched on in the admin area.
--
-- Calendar feed URLs are deliberately NOT here: they contain access tokens
-- and are added through the admin area instead of being committed.

INSERT INTO properties (
  slug, name, is_active, max_guests, max_pets,
  turnover_nights, base_nightly_pence, cleaning_fee_pence, pet_fee_pence,
  default_min_nights, default_max_nights, advance_notice_hours, booking_window_days,
  deposit_percent, balance_due_days_before,
  rate_source, lodgify_property_id, lodgify_room_type_id
) VALUES
  ('muckle-view', 'Muckle View', false, 2, 2,
   0, 16500, 0, 4000,
   2, 28, 24, 270,
   50, 7,
   'LODGIFY', 646178, 713160),
  ('murray-cottage', 'Murray Cottage', false, 6, 2,
   1, 15000, 0, 4000,
   3, 28, 24, 365,
   50, 7,
   'LODGIFY', 794951, 862103);

INSERT INTO admin_users (email, role) VALUES
  ('shaun@donaldson.co.uk', 'OWNER'),
  ('shaun@gamriechalets.co.uk', 'OWNER');
