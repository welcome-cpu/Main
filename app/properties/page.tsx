import type { Metadata } from "next";
import PropertyCard from "@/components/PropertyCard";
import { properties } from "@/lib/properties";

export const metadata: Metadata = {
  title: "Properties",
  description:
    "Muckle View and Murray Cottage — two clifftop studio chalets overlooking the Moray Firth. Mohr Rest joining soon.",
  alternates: { canonical: "/properties" },
};

export default function PropertiesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        The Chalets
      </p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
        Clifftop chalets on a dramatic coastline
      </h1>

      <div className="mt-16 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property, index) => (
          <PropertyCard
            key={property.slug}
            name={property.name}
            description={property.description}
            href={`/properties/${property.slug}`}
            index={index}
            comingSoon={property.comingSoon}
          />
        ))}
      </div>
    </div>
  );
}
