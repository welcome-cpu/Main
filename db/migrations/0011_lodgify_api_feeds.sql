-- Calendar feeds read from Lodgify's API instead of an iCal link. One key
-- (LODGIFY_API_KEY) covers every property, nothing secret is stored, and
-- dates closed in Lodgify come through as well as bookings. The url is just
-- the API address, for display; the import builds its own request.

ALTER TABLE calendar_feeds
  ADD COLUMN kind text NOT NULL DEFAULT 'ICAL' CHECK (kind IN ('ICAL', 'LODGIFY_API'));

-- One API feed per property linked to Lodgify. Existing Lodgify iCal feeds
-- are left as they are, to be switched off once the API feed has synced.
INSERT INTO calendar_feeds (property_id, source, name, url, kind)
SELECT id, 'LODGIFY', 'Lodgify (API)', 'https://api.lodgify.com/v2/availability/' || lodgify_property_id, 'LODGIFY_API'
FROM properties
WHERE lodgify_property_id IS NOT NULL
ON CONFLICT (property_id, url) DO NOTHING;
