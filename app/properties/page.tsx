import type { Metadata } from "next";
import PropertyCard from "@/components/PropertyCard";
import AvailabilitySearch from "@/components/AvailabilitySearch";
import { isDirectBookingEnabled } from "@/lib/booking/feature";
import { formatPence } from "@/lib/money";
import { fromPricesBySlug } from "@/lib/pricing/from-prices";
import { properties } from "@/lib/properties";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "Properties";
const description =
  "Muckle View, a dog-friendly studio chalet, and Murray Cottage, a three-bedroom family home — both overlooking the Moray Firth. Mohr Rest joining soon.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/properties" },
  openGraph: pageOpenGraph({ title, description, path: "/properties" }),
  twitter: pageTwitter({ title, description }),
};

// "From £X/night" comes from the live rates; refresh it hourly.
export const revalidate = 3600;

type Property = (typeof properties)[number];

export default async function PropertiesPage() {
  const fromPence = await fromPricesBySlug();
  const directBooking = isDirectBookingEnabled();

  const facts = (p: Property) => {
    // Without live rates, fall back to the listed band's lower end.
    const from = fromPence[p.slug] ? formatPence(fromPence[p.slug]).replace(/\.00$/, "") : p.priceRange.split("–")[0];
    return [`Sleeps ${p.sleeps}`, p.bedrooms, ...(p.dogFriendly ? ["Dogs welcome"] : []), `From ${from}/night`];
  };
  const card = (p: Property, index: number, wide = false) => (
    <PropertyCard
      key={p.slug}
      name={p.name}
      description={p.description}
      href={`/properties/${p.slug}`}
      bookHref={`/properties/${p.slug}${directBooking ? "#book" : ""}`}
      facts={facts(p)}
      wide={wide}
      index={index}
      comingSoon={p.comingSoon}
      image={p.image}
    />
  );
  const chalets = properties.filter((p) => p.stayType === "chalet");
  const family = properties.filter((p) => p.stayType === "family");

  return (
    <>
      <div className="mx-auto max-w-6xl px-6 pt-24">
        <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">Where to Stay</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
          Two Ways to Stay,
          <br />
          One Extraordinary Spot
        </h1>
        <nav aria-label="Types of stay" className="mt-6 flex flex-wrap gap-3 text-sm font-semibold">
          <a href="#chalets" className="rounded-full border border-primary px-4 py-2 text-primary transition-colors hover:bg-primary/10">
            Chalets for two ↓
          </a>
          <a href="#family-stays" className="rounded-full border border-primary px-4 py-2 text-primary transition-colors hover:bg-primary/10">
            Family stays ↓
          </a>
        </nav>

        <div id="availability" className="mt-12 scroll-mt-24">
          <AvailabilitySearch />
        </div>
      </div>

      <section id="chalets" className="mx-auto max-w-6xl scroll-mt-24 px-6 pt-20 pb-20">
        <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Studio Chalets</h2>
        <p className="mt-2 text-muted-foreground">Intimate, dog-friendly clifftop chalets for couples.</p>
        <div className="mt-8 grid gap-10 sm:grid-cols-2">{chalets.map((p, i) => card(p, i))}</div>
      </section>

      <section id="family-stays" className="scroll-mt-20 bg-muted py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">Family Stays</h2>
          <p className="mt-2 text-muted-foreground">A spacious family home with room for everyone.</p>
          <div className="mt-8">{family.map((p, i) => card(p, chalets.length + i, true))}</div>
        </div>
      </section>
    </>
  );
}
