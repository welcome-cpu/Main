import type { Metadata } from "next";
import PropertyCard from "@/components/PropertyCard";
import AvailabilitySearch from "@/components/AvailabilitySearch";
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

export default function PropertiesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        The Chalets
      </p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
        Two Properties,
        <br />
        One Extraordinary Spot
      </h1>

      <div id="availability" className="mt-12 scroll-mt-24">
        <AvailabilitySearch />
      </div>

      <h2 className="mt-16 text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Choose Your Stay
      </h2>
      <div className="mt-8 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property, index) => (
          <PropertyCard
            key={property.slug}
            name={property.name}
            description={property.description}
            href={`/properties/${property.slug}`}
            index={index}
            comingSoon={property.comingSoon}
            image={property.image}
          />
        ))}
      </div>
    </div>
  );
}
