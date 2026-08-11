import type { Metadata } from "next";
import Link from "next/link";
import GalleryTile from "@/components/GalleryTile";
import AvailabilityCalendar from "@/components/AvailabilityCalendar";
import { properties } from "@/lib/properties";

export const metadata: Metadata = {
  title: "Properties",
  description:
    "Muckle View and Murray Cottage — two clifftop studio chalets overlooking the Moray Firth.",
  alternates: { canonical: "/properties" },
};

export default function PropertiesPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        The Chalets
      </p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
        Two clifftop chalets, one dramatic coastline
      </h1>

      <div className="mt-16 space-y-20">
        {properties.map((property, index) => (
          <div
            key={property.slug}
            id={property.slug}
            className="grid scroll-mt-24 gap-10 sm:grid-cols-2 sm:items-center"
          >
            <div className={index % 2 === 1 ? "sm:order-2" : undefined}>
              <GalleryTile title="" index={index} />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">
                {property.name}
              </h2>
              <p className="mt-4 leading-relaxed text-muted-foreground">
                {property.description}
              </p>
              <div className="mt-6">
                <AvailabilityCalendar propertySlug={property.slug} />
              </div>
              <Link
                href="/contact"
                className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Enquire about {property.name}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
