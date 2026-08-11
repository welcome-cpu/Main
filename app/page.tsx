import type { Metadata } from "next";
import Link from "next/link";
import PropertyCard from "@/components/PropertyCard";
import FeaturedIn from "@/components/FeaturedIn";
import Testimonials from "@/components/Testimonials";
import { bookableProperties } from "@/lib/properties";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const comforts = [
  {
    title: "Log Burner",
    description: "Warm, wood-lit evenings after a day on the coast.",
  },
  {
    title: "Window With a View",
    description: "Panoramic Moray Firth views from every studio chalet.",
  },
  {
    title: "Balcony Binoculars",
    description: "Watch for dolphins by day, the Northern Lights by night.",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative flex min-h-[85vh] items-end overflow-hidden bg-gradient-to-br from-primary via-primary to-accent/60 px-6 pb-16 text-primary-foreground">
        <div className="mx-auto w-full max-w-6xl">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary-foreground/70">
            Escape. Unwind. Recharge.
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
            Luxury Clifftop Chalets with Panoramic Views of the Moray Firth
          </h1>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href="/properties"
              className="rounded-full bg-background px-7 py-3 text-sm font-semibold text-primary transition-colors hover:bg-background/90"
            >
              Discover Gamrie Chalets
            </Link>
            <Link
              href="/contact"
              className="rounded-full border border-primary-foreground/50 px-7 py-3 text-sm font-semibold transition-colors hover:bg-primary-foreground/10"
            >
              Check Availability
            </Link>
          </div>
        </div>
      </section>

      <FeaturedIn />

      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          Your Coastal Hideaway
        </h2>
        <p className="mt-6 text-2xl leading-relaxed text-foreground sm:text-3xl">
          Your perfect retreat on Scotland&apos;s dramatic coastline. Set
          above Gardenstown, our contemporary studio chalets look out across
          the Moray Firth — a quiet base for dolphin watching, coastal walks,
          and doing very little at all.
        </p>
      </section>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Relax in Comfort
          </h2>
          <div className="mt-8 grid gap-10 sm:grid-cols-3">
            {comforts.map((item) => (
              <div key={item.title}>
                <h3 className="text-lg font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            The Chalets
          </h2>
          <Link
            href="/properties"
            className="text-xs font-medium tracking-wide text-primary uppercase hover:underline"
          >
            View all properties →
          </Link>
        </div>
        <div className="grid gap-10 sm:grid-cols-2">
          {bookableProperties.map((property, index) => (
            <PropertyCard
              key={property.slug}
              name={property.name}
              description={property.description}
              href={`/properties/${property.slug}`}
              index={index}
            />
          ))}
        </div>
      </section>

      <Testimonials />

      <section className="border-t border-border px-6 py-24">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Ready to plan your escape?
          </h2>
          <p className="max-w-md text-muted-foreground">
            Get in touch and we&apos;ll help you find the right chalet for
            your dates.
          </p>
          <Link
            href="/contact"
            className="mt-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Contact Us
          </Link>
        </div>
      </section>
    </>
  );
}
