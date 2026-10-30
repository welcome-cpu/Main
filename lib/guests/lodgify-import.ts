import "server-only";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db/client";
import { normalizeLodgifyBookings, type ImportedBooking } from "@/lib/guests/lodgify-bookings";
import { logError } from "@/lib/log";

export type BookingImportOutcome = { ok: boolean; imported: number; error?: string };

const PAGE_SIZE = 50;
// 2,000 bookings; far more than the account holds, so hitting it means
// something is wrong rather than that there's more to fetch.
const MAX_PAGES = 40;

/**
 * Copies every booking for our properties from Lodgify into lodgify_bookings,
 * replacing the previous copy. Read-only on Lodgify's side. On any error the
 * previous copy is left as it was.
 */
export async function importLodgifyBookings(
  trigger: "MANUAL" | "SCHEDULED",
  actor: string | null = null
): Promise<BookingImportOutcome> {
  const sql = db();
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO lodgify_booking_imports (trigger, triggered_by, status)
    VALUES (${trigger}, ${actor}, 'RUNNING') RETURNING id
  `;

  try {
    const apiKey = process.env.LODGIFY_API_KEY;
    if (!apiKey) throw new ImportError("LODGIFY_API_KEY isn't set on this deployment.");

    const properties = await sql<{ id: string; lodgifyPropertyId: number }[]>`
      SELECT id, lodgify_property_id FROM properties WHERE lodgify_property_id IS NOT NULL
    `;
    const propertyFor = new Map(properties.map((p) => [Number(p.lodgifyPropertyId), p.id]));
    if (propertyFor.size === 0) throw new ImportError("No property has a Lodgify property ID.");

    const fetched: ImportedBooking[] = [];
    for (let page = 1; ; page++) {
      if (page > MAX_PAGES) throw new ImportError("Lodgify returned more bookings than expected.");
      const url = new URL("https://api.lodgify.com/v2/reservations/bookings");
      url.searchParams.set("page", String(page));
      url.searchParams.set("size", String(PAGE_SIZE));
      url.searchParams.set("stayFilter", "All");

      let res: Response;
      try {
        res = await fetch(url, {
          headers: { "X-ApiKey": apiKey, Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
      } catch {
        throw new ImportError("Couldn't reach Lodgify.");
      }
      if (!res.ok) throw new ImportError(`Lodgify returned HTTP ${res.status}.`);

      const body = (await res.json()) as { items?: unknown };
      if (!Array.isArray(body?.items)) throw new ImportError("Lodgify's response wasn't in the expected format.");
      fetched.push(...normalizeLodgifyBookings(body));
      if (body.items.length < PAGE_SIZE) break;
    }

    // One row per booking, for our properties only.
    const rows = [...new Map(fetched.map((b) => [b.lodgifyBookingId, b])).values()]
      .filter((b) => propertyFor.has(b.lodgifyPropertyId))
      .map(({ lodgifyPropertyId, ...b }) => ({ ...b, propertyId: propertyFor.get(lodgifyPropertyId)! }));
    // An empty answer is far more likely a fault than a real account with no
    // bookings, and would otherwise wipe the copy.
    if (rows.length === 0) throw new ImportError("Lodgify returned no bookings for our properties.");

    await sql.begin(async (tx) => {
      // Bookings deleted in Lodgify drop out of the copy.
      await tx`DELETE FROM lodgify_bookings WHERE NOT (lodgify_booking_id = ANY(${rows.map((r) => r.lodgifyBookingId)}::bigint[]))`;
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        await tx`
          INSERT INTO lodgify_bookings ${tx(
            batch,
            "lodgifyBookingId",
            "propertyId",
            "channel",
            "status",
            "arrival",
            "departure",
            "guestName",
            "country",
            "adults",
            "children",
            "infants",
            "pets"
          )}
          ON CONFLICT (lodgify_booking_id) DO UPDATE SET
            property_id = EXCLUDED.property_id,
            channel = EXCLUDED.channel,
            status = EXCLUDED.status,
            arrival = EXCLUDED.arrival,
            departure = EXCLUDED.departure,
            guest_name = EXCLUDED.guest_name,
            country = EXCLUDED.country,
            adults = EXCLUDED.adults,
            children = EXCLUDED.children,
            infants = EXCLUDED.infants,
            pets = EXCLUDED.pets,
            imported_at = now()
        `;
      }
      await tx`
        UPDATE lodgify_booking_imports SET status = 'OK', finished_at = now(), bookings_imported = ${rows.length}
        WHERE id = ${run.id}
      `;
      await recordAudit(tx, {
        actorType: actor ? "ADMIN" : "SYSTEM",
        actor,
        action: "lodgify_bookings.imported",
        entityType: "lodgify_booking_import",
        entityId: run.id,
        details: { trigger, bookings: rows.length },
      });
    });

    return { ok: true, imported: rows.length };
  } catch (error) {
    const message = error instanceof ImportError ? error.message : "Unexpected error importing bookings.";
    if (!(error instanceof ImportError)) logError("Lodgify booking import failed", error);
    await sql.begin(async (tx) => {
      await tx`UPDATE lodgify_booking_imports SET status = 'ERROR', finished_at = now(), error = ${message} WHERE id = ${run.id}`;
      await recordAudit(tx, {
        actorType: actor ? "ADMIN" : "SYSTEM",
        actor,
        action: "lodgify_bookings.import_failed",
        entityType: "lodgify_booking_import",
        entityId: run.id,
        details: { trigger, error: message },
      });
    });
    return { ok: false, imported: 0, error: message };
  }
}

export async function lastBookingImport() {
  const [row] = await db()<{ status: string; startedAt: Date; bookingsImported: number | null; error: string | null }[]>`
    SELECT status, started_at, bookings_imported, error FROM lodgify_booking_imports
    ORDER BY started_at DESC LIMIT 1
  `;
  return row ?? null;
}

export type CountryCount = { country: string | null; thisYear: number; lastYear: number; allTime: number };

/**
 * Where guests come from, by year of arrival: Lodgify's confirmed bookings
 * plus confirmed bookings taken on this site. Cancelled, declined and
 * enquiry-only Lodgify records are left out.
 */
export async function guestCountries(year: number): Promise<CountryCount[]> {
  return db()<CountryCount[]>`
    WITH stays AS (
      SELECT country, arrival FROM lodgify_bookings WHERE status = 'Booked'
      UNION ALL
      SELECT g.country, r.check_in FROM reservations r JOIN guests g ON g.id = r.guest_id
      WHERE r.status = 'CONFIRMED'
    )
    SELECT country,
           count(*) FILTER (WHERE extract(year FROM arrival) = ${year})::int AS this_year,
           count(*) FILTER (WHERE extract(year FROM arrival) = ${year - 1})::int AS last_year,
           count(*)::int AS all_time
    FROM stays
    GROUP BY country
    ORDER BY this_year DESC, all_time DESC, country NULLS LAST
  `;
}

class ImportError extends Error {}
