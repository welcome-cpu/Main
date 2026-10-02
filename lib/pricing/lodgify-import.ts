import "server-only";
import { recordAudit } from "@/lib/audit";
import { addDays, todayInZone } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { logError } from "@/lib/log";
import { normalizeLodgifyCalendar } from "@/lib/pricing/lodgify-rates";

export type RateImportOutcome = {
  propertyId: string;
  propertyName: string;
  ok: boolean;
  nightsWritten: number;
  error?: string;
};

type PropertyRow = {
  id: string;
  name: string;
  timezone: string;
  rateSource: string;
  lodgifyPropertyId: number | null;
  lodgifyRoomTypeId: number | null;
  bookingWindowDays: number;
  defaultMaxNights: number;
};

/**
 * Copies Lodgify's nightly prices and min/max stays into nightly_rates for
 * the whole booking window. Only rows that came from Lodgify are ever
 * overwritten; prices entered in the admin area are never touched. On any
 * error, existing prices are left as they were.
 */
export async function importLodgifyRates(
  propertyId: string,
  trigger: "MANUAL" | "SCHEDULED",
  actor: string | null = null
): Promise<RateImportOutcome> {
  const sql = db();
  const [p] = await sql<PropertyRow[]>`
    SELECT id, name, timezone, rate_source, lodgify_property_id, lodgify_room_type_id,
           booking_window_days, default_max_nights
    FROM properties WHERE id = ${propertyId}
  `;
  if (!p) throw new Error("Property not found");

  const firstNight = todayInZone(p.timezone);
  const lastNight = addDays(firstNight, p.bookingWindowDays + p.defaultMaxNights);
  const [run] = await sql<{ id: string }[]>`
    INSERT INTO rate_imports (property_id, trigger, triggered_by, status, first_night, last_night)
    VALUES (${p.id}, ${trigger}, ${actor}, 'RUNNING', ${firstNight}, ${lastNight})
    RETURNING id
  `;

  try {
    if (p.rateSource !== "LODGIFY" || !p.lodgifyPropertyId || !p.lodgifyRoomTypeId) {
      throw new ImportError("This property isn't set to take its prices from Lodgify.");
    }
    const apiKey = process.env.LODGIFY_API_KEY;
    if (!apiKey) throw new ImportError("LODGIFY_API_KEY isn't set on this deployment.");

    const url = new URL("https://api.lodgify.com/v2/rates/calendar");
    url.searchParams.set("HouseId", String(p.lodgifyPropertyId));
    url.searchParams.set("RoomTypeId", String(p.lodgifyRoomTypeId));
    url.searchParams.set("StartDate", firstNight);
    url.searchParams.set("EndDate", lastNight);

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

    const nights = normalizeLodgifyCalendar(await res.json()).filter(
      (n) => n.night >= firstNight && n.night <= lastNight
    );
    if (nights.length === 0) throw new ImportError("Lodgify returned no prices.");

    await sql.begin(async (tx) => {
      for (let i = 0; i < nights.length; i += 200) {
        const batch = nights.slice(i, i + 200).map((n) => ({
          propertyId: p.id,
          night: n.night,
          pricePence: n.pricePence,
          minNights: n.minNights,
          maxNights: n.maxNights,
          source: "LODGIFY_IMPORT",
        }));
        await tx`
          INSERT INTO nightly_rates ${tx(batch, "propertyId", "night", "pricePence", "minNights", "maxNights", "source")}
          ON CONFLICT (property_id, night) DO UPDATE SET
            price_pence = EXCLUDED.price_pence,
            min_nights = EXCLUDED.min_nights,
            max_nights = EXCLUDED.max_nights,
            updated_at = now()
          WHERE nightly_rates.source = 'LODGIFY_IMPORT'
        `;
      }
      await tx`
        UPDATE rate_imports SET status = 'OK', finished_at = now(), nights_written = ${nights.length}
        WHERE id = ${run.id}
      `;
      await recordAudit(tx, {
        actorType: actor ? "ADMIN" : "SYSTEM",
        actor,
        action: "rates.imported",
        entityType: "property",
        entityId: p.id,
        propertyId: p.id,
        details: { trigger, firstNight, lastNight, nights: nights.length },
      });
    });

    return { propertyId: p.id, propertyName: p.name, ok: true, nightsWritten: nights.length };
  } catch (error) {
    const message = error instanceof ImportError ? error.message : "Unexpected error importing prices.";
    if (!(error instanceof ImportError)) logError("Lodgify rate import failed", error);
    await sql.begin(async (tx) => {
      await tx`UPDATE rate_imports SET status = 'ERROR', finished_at = now(), error = ${message} WHERE id = ${run.id}`;
      await recordAudit(tx, {
        actorType: actor ? "ADMIN" : "SYSTEM",
        actor,
        action: "rates.import_failed",
        entityType: "property",
        entityId: p.id,
        propertyId: p.id,
        details: { trigger, error: message },
      });
    });
    return { propertyId: p.id, propertyName: p.name, ok: false, nightsWritten: 0, error: message };
  }
}

export async function importAllLodgifyRates(trigger: "MANUAL" | "SCHEDULED", actor: string | null = null) {
  const properties = await db()<{ id: string }[]>`
    SELECT id FROM properties WHERE rate_source = 'LODGIFY' ORDER BY name
  `;
  const outcomes: RateImportOutcome[] = [];
  for (const p of properties) outcomes.push(await importLodgifyRates(p.id, trigger, actor));
  return outcomes;
}

export async function lastRateImport(propertyId: string) {
  const [row] = await db()<
    { status: string; startedAt: Date; nightsWritten: number | null; error: string | null; lastNight: string | null }[]
  >`
    SELECT status, started_at, nights_written, error, last_night FROM rate_imports
    WHERE property_id = ${propertyId} ORDER BY started_at DESC LIMIT 1
  `;
  return row ?? null;
}

class ImportError extends Error {}
