-- Mohr Rest, the studio chalet next to Muckle View, opening 1 January 2027.
-- It is identical to Muckle View, so it starts from Muckle View's current
-- settings (whatever they have been changed to in the admin area), with its
-- own Lodgify IDs. Like the others it starts with is_active = false: nothing
-- is directly bookable until it is switched on in the admin area.

INSERT INTO properties (
  slug, name, is_active, timezone, currency, max_guests, max_pets, check_in_time, check_out_time,
  turnover_nights, base_nightly_pence, cleaning_fee_pence, pet_fee_pence,
  default_min_nights, default_max_nights, advance_notice_hours, booking_window_days,
  deposit_percent, balance_due_days_before,
  rate_source, lodgify_property_id, lodgify_room_type_id
)
SELECT
  'mohr-rest', 'Mohr Rest', false, timezone, currency, max_guests, max_pets, check_in_time, check_out_time,
  turnover_nights, base_nightly_pence, cleaning_fee_pence, pet_fee_pence,
  default_min_nights, default_max_nights, advance_notice_hours, booking_window_days,
  deposit_percent, balance_due_days_before,
  'LODGIFY', 862655, 929844
FROM properties WHERE slug = 'muckle-view'
ON CONFLICT (slug) DO NOTHING;

-- Closed until opening day, whatever the calendars say. The block can be
-- removed in the admin area like any other.
INSERT INTO manual_blocks (property_id, start_date, end_date, reason, created_by)
SELECT id, current_date, '2027-01-01', 'Opens 1 January 2027', 'system'
FROM properties
WHERE slug = 'mohr-rest' AND current_date < '2027-01-01'
  AND NOT EXISTS (
    SELECT 1 FROM manual_blocks b
    WHERE b.property_id = properties.id AND b.reason = 'Opens 1 January 2027'
  );
