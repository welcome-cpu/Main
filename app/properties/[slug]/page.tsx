import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PropertyMedia from "@/components/PropertyMedia";
import LodgifyBookingWidget from "@/components/LodgifyBookingWidget";
import { properties } from "@/lib/properties";
import { breadcrumbJsonLd } from "@/lib/breadcrumb";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";
import { SITE_URL } from "@/lib/site";

export async function generateStaticParams() {
  return properties.map((property) => ({ slug: property.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/properties/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const property = properties.find((p) => p.slug === slug);

  if (!property) {
    return {};
  }

  const title = property.comingSoon
    ? `${property.name} (Coming Soon)`
    : property.name;
  const { description } = property;

  return {
    title,
    description,
    alternates: { canonical: `/properties/${property.slug}` },
    // Coming-soon properties have no real content yet — keep them out of
    // search results until the listing actually launches.
    ...(property.comingSoon && { robots: { index: false, follow: true } }),
    openGraph: pageOpenGraph({
      title,
      description,
      path: `/properties/${property.slug}`,
      images: [
        { url: property.image.src, width: property.image.width, height: property.image.height },
      ],
    }),
    twitter: pageTwitter({ title, description, images: [property.image.src] }),
  };
}

export default async function PropertyPage({
  params,
}: PageProps<"/properties/[slug]">) {
  const { slug } = await params;
  const property = properties.find((p) => p.slug === slug);

  if (!property) {
    notFound();
  }

  const jsonLd = breadcrumbJsonLd([
    { name: "Home", path: "/" },
    { name: "Properties", path: "/properties" },
    { name: property.name, path: `/properties/${property.slug}` },
  ]);

  const vacationRentalJsonLd = {
    "@context": "https://schema.org",
    "@type": "VacationRental",
    name: property.name,
    description: property.description,
    url: `${SITE_URL}/properties/${property.slug}`,
    image: [`${SITE_URL}${property.image.src}`],
    address: {
      "@type": "PostalAddress",
      addressLocality: "Gardenstown",
      addressRegion: "Aberdeenshire",
      addressCountry: "GB",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: property.location.lat,
      longitude: property.location.lng,
    },
    occupancy: { "@type": "QuantitativeValue", maxValue: property.sleeps },
    ...(property.priceRange && { priceRange: property.priceRange }),
    petsAllowed: property.features.some((feature) => /dog/i.test(feature)),
    amenityFeature: property.features.map((feature) => ({
      "@type": "LocationFeatureSpecification",
      name: feature,
    })),
  };

  return (
    <div className="pb-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(vacationRentalJsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <Link
          href="/properties"
          className="text-xs font-medium tracking-wide text-primary uppercase hover:underline"
        >
          ← All Properties
        </Link>
      </div>

      <div className="mt-6">
        <PropertyMedia
          image={property.image}
          gallery={property.gallery}
          name={property.name}
          index={properties.indexOf(property)}
          overlayLabel={property.comingSoon ? "Coming Soon" : undefined}
        />
      </div>

      <div className="mx-auto max-w-6xl px-6">
        <div className="mt-10">
          {property.comingSoon && (
            <span className="inline-block rounded-full bg-oak/30 px-3 py-1 text-xs font-semibold tracking-wide text-foreground uppercase">
              Coming Soon
            </span>
          )}
          {property.tagline && (
            <p className="mt-4 text-xs font-semibold tracking-[0.3em] text-accent uppercase">
              {property.tagline}
            </p>
          )}
          <h1 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">
            {property.name}
          </h1>
          {(property.longDescription ?? [property.description]).map((paragraph) => (
            <p key={paragraph} className="mt-4 leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}

          {property.features && (
            <ul className="mt-6 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {property.features.map((feature) => (
                <li
                  key={feature}
                  className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                >
                  <span className="text-accent">•</span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          )}

          {property.comingSoon ? (
            <>
              <div className="mt-8 rounded-xl border border-border bg-muted px-5 py-4 text-sm text-muted-foreground">
                {property.name} isn&apos;t open for booking yet.{" "}
                <Link
                  href="/contact"
                  className="font-semibold text-primary hover:underline"
                >
                  Get in touch
                </Link>{" "}
                to be the first to know when it&apos;s ready.
              </div>
              <Link
                href="/contact"
                className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                {`Register Interest in ${property.name}`}
              </Link>
            </>
          ) : property.lodgifyRentalId ? (
            <div className="mt-8">
              <LodgifyBookingWidget rentalId={property.lodgifyRentalId} />
            </div>
          ) : (
            <Link
              href="/contact"
              className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {`Enquire about ${property.name}`}
            </Link>
          )}
        </div>

        {property.location && (
          <div className="mt-16 rounded-2xl border border-border bg-muted px-6 py-8 shadow-lg sm:px-10 sm:py-10">
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Where to Find Us
            </h2>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Gamrie Chalets sits above Gardenstown on the Aberdeenshire
              coast, roughly:
            </p>
            <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
              <li className="flex gap-2">
                <span className="text-accent">•</span>
                <span>1 hour from Aberdeen</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent">•</span>
                <span>2 hours from Inverness Airport</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent">•</span>
                <span>20 minutes from Banff and Macduff</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent">•</span>
                <span>On the North East Coast 250 scenic route</span>
              </li>
              <li className="flex gap-2">
                <span className="text-accent">•</span>
                <span>On the Malt Whisky Trail</span>
              </li>
            </ul>
            <p className="mt-4 leading-relaxed text-muted-foreground">
              Coastal walks, dolphin watching, distillery visits, and
              historic fishing villages are all within a short drive or an
              easy stroll.
            </p>
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${property.location.lat},${property.location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-6 inline-block rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Get Directions
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
