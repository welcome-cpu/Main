import { loadEnvFile } from "node:process";
import postgres from "postgres";

export const E2E_SLUG = "e2e-chalet";
export const E2E_SECRET_GUEST = "E2E Secret Guestname";

/** Seeds a known property on the test database and clears its live holds. */
export default async function globalSetup() {
  try {
    loadEnvFile(".env.local");
  } catch {}
  const sql = postgres(process.env.TEST_DATABASE_URL!, { max: 1, prepare: false, onnotice: () => {} });
  try {
    const [p] = await sql<{ id: string }[]>`
      INSERT INTO properties (slug, name, is_active, max_guests, max_pets, base_nightly_pence, pet_fee_pence,
        default_min_nights, default_max_nights, deposit_percent, balance_due_days_before,
        advance_notice_hours, booking_window_days, rate_source, turnover_nights)
      VALUES (${E2E_SLUG}, 'E2E Chalet', true, 2, 1, 12000, 4000, 2, 28, 50, 7, 0, 400, 'MANUAL', 0)
      ON CONFLICT (slug) DO UPDATE SET is_active = true, base_nightly_pence = 12000, pet_fee_pence = 4000,
        default_min_nights = 2, deposit_percent = 50, balance_due_days_before = 7, advance_notice_hours = 0,
        booking_window_days = 400, rate_source = 'MANUAL', max_guests = 2, max_pets = 1, turnover_nights = 0
      RETURNING id
    `;
    // Any holds or bookings from earlier runs are released, so dates are free.
    await sql`UPDATE reservations SET status = 'EXPIRED' WHERE property_id = ${p.id} AND status = 'HOLD'`;
    await sql`
      UPDATE reservations SET status = 'CANCELLED', cancelled_at = now(), cancellation_reason = 'e2e reset'
      WHERE property_id = ${p.id} AND status = 'CONFIRMED'
    `;
    await sql`DELETE FROM nightly_rates WHERE property_id = ${p.id}`;

    // An imported booking 40–43 days out, with a guest name that must never reach the public.
    const [feed] = await sql<{ id: string }[]>`
      INSERT INTO calendar_feeds (property_id, source, name, url)
      VALUES (${p.id}, 'AIRBNB', 'E2E Airbnb', 'https://feeds.test/e2e.ics')
      ON CONFLICT (property_id, url) DO UPDATE SET is_active = true RETURNING id
    `;
    await sql`
      INSERT INTO external_events (feed_id, property_id, uid, start_date, end_date, summary, status, content_hash)
      VALUES (${feed.id}, ${p.id}, 'e2e-airbnb-1', current_date + 40, current_date + 43, ${E2E_SECRET_GUEST}, 'ACTIVE', 'x')
      ON CONFLICT (feed_id, uid) DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date,
        status = 'ACTIVE', removed_at = NULL
    `;
    await sql`
      INSERT INTO discount_codes (code, discount_type, percent_off) VALUES ('E2E10', 'PERCENT', 10)
      ON CONFLICT (code) DO UPDATE SET is_active = true
    `;
  } finally {
    await sql.end();
  }
}
