import "server-only";
import type { Sql, Tx } from "@/lib/db/client";
import { logError } from "@/lib/log";

// Promotion codes are managed in Lodgify. A code that isn't one of our own
// discount codes is checked with Lodgify's quote for the same stay: Lodgify
// applies its own rules (dates, booking window, minimum stay) and says how
// much it takes off. Never taken from the browser.

export type LodgifyPromotion = {
  code: string;
  /** The promotion's name in Lodgify, e.g. "December Discount". */
  name: string;
  /** What Lodgify takes off its room rate, as a percentage, so it applies to ours exactly. */
  percentOff: number;
};

export type LodgifyPromotionLookup = { ok: true; promotion: LodgifyPromotion } | { ok: false; message: string };

type Stay = { checkIn: string; checkOut: string; adults: number; children: number };

/**
 * Checks a code with Lodgify for this stay, or returns null when Lodgify
 * doesn't need asking: no code, one of our own codes, or a property that
 * doesn't take its prices from Lodgify.
 */
export async function lookupLodgifyPromotion(
  sql: Sql | Tx,
  propertyId: string,
  stay: Stay,
  rawCode: string | null | undefined
): Promise<LodgifyPromotionLookup | null> {
  const code = (rawCode ?? "").trim().toUpperCase();
  if (!code) return null;
  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) return { ok: false, message: "We don't recognise that code." };

  const [property] = await sql<{ lodgifyPropertyId: number | null; lodgifyRoomTypeId: number | null; ownCode: boolean }[]>`
    SELECT p.lodgify_property_id, p.lodgify_room_type_id,
      EXISTS (SELECT 1 FROM discount_codes d WHERE d.code = ${code} AND d.is_active
              AND (d.property_id IS NULL OR d.property_id = p.id)) AS own_code
    FROM properties p WHERE p.id = ${propertyId} AND p.rate_source = 'LODGIFY'
  `;
  if (!property || property.ownCode || !property.lodgifyPropertyId || !property.lodgifyRoomTypeId) return null;
  const apiKey = process.env.LODGIFY_API_KEY;
  if (!apiKey) return null;

  const url = new URL(`https://api.lodgify.com/v2/quote/${property.lodgifyPropertyId}`);
  url.searchParams.set("arrival", stay.checkIn);
  url.searchParams.set("departure", stay.checkOut);
  url.searchParams.set("roomTypes[0].Id", String(property.lodgifyRoomTypeId));
  url.searchParams.set("roomTypes[0].People", String(Math.max(1, stay.adults + stay.children)));
  url.searchParams.set("promotionCode", code);

  let body: unknown;
  try {
    const res = await fetch(url, {
      headers: { "X-ApiKey": apiKey, Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Lodgify quote returned HTTP ${res.status}`);
    body = await res.json();
  } catch (error) {
    logError("Lodgify promotion check failed", error);
    return { ok: false, message: "We couldn't check that code just now. Please try again in a moment." };
  }

  const promotion = readPromotion(body, code);
  return promotion
    ? { ok: true, promotion }
    : { ok: false, message: "We don't recognise that code, or it isn't valid for these dates." };
}

type QuotePriceType = { type?: number; subtotal?: number; prices?: { description?: string; amount?: number }[] };

/** The promotion in a Lodgify quote: price type 1, against the room rate (type 0). */
export function readPromotion(body: unknown, code: string): LodgifyPromotion | null {
  const priceTypes = (body as { room_types?: { price_types?: QuotePriceType[] }[] }[] | null)?.[0]?.room_types?.[0]?.price_types;
  if (!Array.isArray(priceTypes)) return null;
  const roomRate = Number(priceTypes.find((p) => p.type === 0)?.subtotal ?? 0);
  const promo = priceTypes.find((p) => p.type === 1);
  const off = -Number(promo?.subtotal ?? 0);
  if (!(roomRate > 0) || !(off > 0) || off > roomRate) return null;
  const name = promo?.prices?.find((p) => typeof p.description === "string" && p.description)?.description ?? "Promotion";
  return { code, name: name.slice(0, 100), percentOff: (off / roomRate) * 100 };
}
