import "server-only";
import { getPublicCalendar, getPublicProperty, type PublicCalendar } from "@/lib/booking/public";
import { addDays, todayInZone } from "@/lib/dates";
import { db } from "@/lib/db/client";
import { loadExtras } from "@/lib/pricing/quote-service";
import { properties } from "@/lib/properties";

export type PublicExtra = {
  id: string;
  name: string;
  description: string | null;
  pricePence: number;
  pricingType: "PER_STAY" | "PER_NIGHT" | "PER_GUEST" | "PER_GUEST_PER_NIGHT";
  maxQuantity: number;
};

export type ChaletSetup = { slug: string; calendar: PublicCalendar; extras: PublicExtra[] };

/**
 * Everything the booking widget needs for a property: its calendar and
 * extras, then the same for the identical chalet next door (once that's
 * open for booking), so guests can book either from one page. Public data
 * only. Null if the property doesn't exist.
 */
export async function loadBookingSetup(slug: string): Promise<ChaletSetup[] | null> {
  const property = await getPublicProperty(slug);
  if (!property) return null;
  const twinSlug = properties.find((p) => p.slug === property.slug)?.twinSlug;
  const twin = twinSlug ? await getPublicProperty(twinSlug) : null;

  const today = todayInZone(property.timezone);
  const from = `${today.slice(0, 7)}-01`;
  return Promise.all(
    [property, ...(twin?.isActive ? [twin] : [])].map(async (p) => {
      const to = addDays(today, p.bookingWindowDays + p.defaultMaxNights + p.turnoverNights + 31);
      const [calendar, extras] = await Promise.all([getPublicCalendar(p, { start: from, end: to }), loadExtras(db(), p.id)]);
      return {
        slug: p.slug,
        calendar,
        extras: extras.map(({ id, name, description, pricePence, pricingType, maxQuantity }) => ({
          id,
          name,
          description,
          pricePence,
          pricingType,
          maxQuantity,
        })),
      };
    })
  );
}
