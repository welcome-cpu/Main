import type { Metadata } from "next";
import Link from "next/link";
import PropertyCard from "@/components/PropertyCard";
import FeaturedIn from "@/components/FeaturedIn";
import Testimonials from "@/components/Testimonials";
import AvailabilitySearch from "@/components/AvailabilitySearch";
import BackgroundVideo from "@/components/BackgroundVideo";
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
      <section className="relative flex min-h-[85vh] items-end overflow-hidden px-6 pb-16 text-primary-foreground">
        <BackgroundVideo
          sources={[
            "/sceneinvideo_-_muckle_view,_high_green_gardenstown,_ab45_3yn (720p).mp4",
            "/sceneinvideo_-_murray_cottage,_7_garden_crescent,_gardenstown,_ab45_3zj (720p).mp4",
          ]}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/85 via-primary/70 to-accent/60" />
        <div className="relative z-10 mx-auto w-full max-w-6xl">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary-foreground/70">
            Escape. Unwind. Recharge.
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
            Luxury Self-Catering on the Aberdeenshire Coast
          </h1>
          <div className="mt-8 w-full">
            <AvailabilitySearch />
          </div>
        </div>
      </section>

      <FeaturedIn />

      <section className="mx-auto max-w-3xl px-6 py-24">
        <h2 className="text-center text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          Your Coastal Hideaway
        </h2>
        <p className="mt-6 text-lg leading-relaxed text-foreground">
          Some places you visit. Others stay with you long after
          you&apos;ve driven home. Gamrie Chalets is luxury self-catering in
          Aberdeenshire, perched high on the clifftop above the fishing
          village of Gardenstown, where the Moray Firth opens out beneath
          you - silver at dawn, gold at dusk, and never quite the same view
          twice.
        </p>
        <p className="mt-6 text-lg leading-relaxed text-foreground">
          This is coastal accommodation with a genuine sense of place. Two
          ways to stay, both built around the setting: intimate,
          dog-friendly studio chalets for couples, and a generous family
          home with room for everyone to breathe.
        </p>
        <p className="mt-6 text-lg leading-relaxed text-foreground">
          We sit right on the North East Coast 250, with the sea at your
          doorstep and some of Scotland&apos;s finest coastline unfolding in
          every direction. Come for a long weekend or settle in for a
          slower week - either way, this is the kind of stay that&apos;s
          worth the journey north.
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
              image={property.image}
            />
          ))}
        </div>
      </section>

      <Testimonials />

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Your Clifftop Stay Is Waiting
          </h2>
          <p className="text-muted-foreground">
            Two special properties. One unforgettable setting above the
            Moray Firth. Whether it&apos;s a couple&apos;s escape with the
            dog or a family gathering by the sea, your dates are the only
            thing standing between you and the coast.
          </p>
          <Link
            href="/properties"
            className="mt-2 rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View Properties
          </Link>
        </div>
      </section>
    </>
  );
}
