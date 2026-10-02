import "server-only";
import { db } from "@/lib/db/client";

export type CalendarItemType =
  | "DIRECT"
  | "MANUAL_BOOKING"
  | "HOLD"
  | "AIRBNB"
  | "BOOKING_COM"
  | "LODGIFY"
  | "OTHER"
  | "BLOCK";

export type CalendarItem = {
  type: CalendarItemType;
  /** Nights [start, end). */
  start: string;
  end: string;
  label: string;
  /** Link to the booking, for bookings taken here. */
  reservationId: string | null;
};

export type CalendarRow = { propertyId: string; propertyName: string; turnoverNights: number; items: CalendarItem[] };

/** Everything occupying each property between `from` and `to`, for the admin calendar. */
export async function loadAdminCalendar(from: string, to: string): Promise<CalendarRow[]> {
  const sql = db();
  const [properties, items] = await Promise.all([
    sql<{ id: string; name: string; turnoverNights: number }[]>`
      SELECT id, name, turnover_nights FROM properties ORDER BY name
    `,
    sql<(CalendarItem & { propertyId: string })[]>`
      WITH win AS (SELECT daterange(${from}::date, ${to}::date, '[)') AS w)
      SELECT r.property_id,
             CASE WHEN r.status = 'HOLD' THEN 'HOLD' WHEN r.source = 'MANUAL' THEN 'MANUAL_BOOKING' ELSE 'DIRECT' END AS type,
             r.check_in::text AS start, r.check_out::text AS "end",
             r.reference || COALESCE(' · ' || g.last_name, '') AS label, r.id AS reservation_id
      FROM reservations r LEFT JOIN guests g ON g.id = r.guest_id, win
      WHERE (r.status = 'CONFIRMED' OR (r.status = 'HOLD' AND r.hold_expires_at > now())) AND r.stay && win.w
      UNION ALL
      SELECT e.property_id,
             CASE WHEN f.source IN ('AIRBNB', 'BOOKING_COM', 'LODGIFY') THEN f.source ELSE 'OTHER' END,
             e.start_date::text, e.end_date::text, COALESCE(e.summary, f.name), NULL
      FROM external_events e JOIN calendar_feeds f ON f.id = e.feed_id AND f.is_active, win
      WHERE e.status = 'ACTIVE' AND e.nights && win.w
      UNION ALL
      SELECT b.property_id, 'BLOCK', b.start_date::text, b.end_date::text, COALESCE(b.reason, 'Blocked'), NULL
      FROM manual_blocks b, win
      WHERE b.is_active AND b.nights && win.w
      ORDER BY start
    `,
  ]);

  return properties.map((p) => ({
    propertyId: p.id,
    propertyName: p.name,
    turnoverNights: p.turnoverNights,
    items: items
      .filter((i) => i.propertyId === p.id)
      .map((i) => ({ type: i.type, start: i.start, end: i.end, label: i.label, reservationId: i.reservationId })),
  }));
}
