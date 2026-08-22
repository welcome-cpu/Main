import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PropertyMedia from "@/components/PropertyMedia";
import LodgifyBookingWidget from "@/components/LodgifyBookingWidget";
import { properties } from "@/lib/properties";
import { breadcrumbJsonLd } from "@/lib/breadcrumb";

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

  return {
    title: property.comingSoon ? `${property.name} (Coming Soon)` : property.name,
    description: property.description,
    alternates: { canonical: `/properties/${property.slug}` },
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Link
        href="/properties"
        className="text-xs font-medium tracking-wide text-primary uppercase hover:underline"
      >
        ← All Properties
      </Link>

      <div className="mt-8 grid gap-10 sm:grid-cols-2 sm:items-start">
        <PropertyMedia
          image={property.image}
          name={property.name}
          index={properties.indexOf(property)}
          overlayLabel={property.comingSoon ? "Coming Soon" : undefined}
        />
        <div>
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
      </div>
    </div>
  );
}
