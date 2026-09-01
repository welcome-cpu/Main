import type { Metadata } from "next";
import Link from "next/link";
import PropertyMedia from "@/components/PropertyMedia";
import FeaturedIn from "@/components/FeaturedIn";
import Testimonials from "@/components/Testimonials";
import BackgroundVideo from "@/components/BackgroundVideo";
import { bookableProperties } from "@/lib/properties";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const whyStay = [
  {
    text: "Panoramic Moray Firth views from every studio chalet, ever-changing through the day",
    link: { word: "studio chalet", href: "/properties/muckle-view" },
  },
  {
    text: "Log-burner evenings to warm you after a day on the Aberdeenshire coast",
  },
  {
    text: "Dolphins by day, Northern Lights by night, watched from your own balcony",
  },
  {
    text: "On-site EV charging, so the drive north is easy in an electric car",
  },
  {
    text: "A walkable village and open coast, with coastal walks beginning right outside the door",
  },
];

const fromYourDoorstep = [
  {
    title: "Coastal walks",
    text: "Cliff paths begin steps from the door, winding toward hidden coves and the tiny gable-end village of Crovie.",
  },
  {
    title: "Dolphin watching",
    text: "The Moray Firth holds one of Europe's largest populations of bottlenose dolphins — often visible right from the balcony.",
  },
  {
    title: "Beaches",
    text: "Sandy Gardenstown Beach is nearest, with Sandend Bay, Inverboyndie, and more along the wider coast.",
  },
  {
    title: "The North East 250",
    text: "One of Scotland's great scenic drives runs right past, threading castles, villages, and sea views together.",
  },
  {
    title: "The whisky trail",
    text: "Speyside's storied distilleries sit within an easy drive, from Glenglassaugh to the wider Malt Whisky Trail.",
    link: { word: "Malt Whisky Trail", href: "/about#whisky-distilleries" },
  },
];

const homeFaqs = [
  {
    question: "Are dogs welcome?",
    answer:
      "Yes. Our studio chalets offer dog-friendly self-catering above Gardenstown, with coastal walks starting right outside the door and dog-welcoming cafés in the village below.",
  },
  {
    question: "Is there EV charging?",
    answer:
      "Yes, at Muckle View. On-site EV charging is ready and waiting, so you can plug in the moment you arrive at your clifftop chalet.",
  },
  {
    question: "How close is Gardenstown?",
    answer:
      "We sit on the clifftop directly above Gardenstown. The village, its working harbour, and its cafés are a short, scenic walk away — no car needed.",
  },
  {
    question: "Can I book a short break?",
    answer:
      "Absolutely. Come for a short break or a long weekend on the Aberdeenshire coast, or settle in for a slower week — both work beautifully here.",
  },
];

const homeFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: homeFaqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

const muckleView = bookableProperties.find((p) => p.slug === "muckle-view")!;
const murrayCottage = bookableProperties.find(
  (p) => p.slug === "murray-cottage"
)!;

export default function Home() {
  return (
    <>
      <section className="relative flex min-h-[85vh] items-end overflow-hidden px-6 pb-16 text-primary-foreground">
        <BackgroundVideo
          src="/Hero Video Final.mp4"
          poster={{ src: "/Hero_Video_Poster.jpg", width: 1920, height: 1080 }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-foreground/85 via-foreground/25 to-transparent" />
        <div className="relative z-10 mx-auto w-full max-w-7xl">
          <p className="text-xs font-semibold tracking-[0.3em] uppercase text-primary-foreground/70">
            Escape. Unwind. Recharge.
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-6xl">
            Luxury Dog-Friendly Self-Catering on the
            <br />
            Aberdeenshire Coast
          </h1>
          <p className="mt-4 max-w-2xl text-lg font-medium text-primary-foreground/90 sm:text-xl">
            Dog-friendly clifftop chalets above Gardenstown, with panoramic
            Moray Firth views at your feet and your dog by your side.
          </p>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <p className="text-lg leading-relaxed text-muted-foreground">
            Some places you visit. Others stay with you long after
            you&apos;ve driven home. Perched high above the fishing village of
            Gardenstown, Gamrie Chalets pairs sweeping Moray Firth views with
            a warm, wood-lit welcome for you and your dog.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            This is luxury self-catering on the Aberdeenshire coast with a
            genuine sense of place. Two ways to stay, both built around the
            setting: intimate,{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
            <a
              href="/properties/muckle-view"
              className="font-semibold text-primary hover:underline"
            >
              dog-friendly studio chalets
            </a>{" "}
            for couples, and a{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
            <a
              href="/properties/murray-cottage"
              className="font-semibold text-primary hover:underline"
            >
              spacious family holiday home
            </a>{" "}
            with room for everyone to breathe.
          </p>
          <Link
            href="/properties#availability"
            className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Check Availability
          </Link>
        </div>
      </section>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Why Stay on the Aberdeenshire Coast
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-foreground">
            We sit right on the{" "}
            <Link
              href="/about"
              className="font-semibold text-primary hover:underline"
            >
              North East 250
            </Link>
            , with the sea at your doorstep and some of Scotland&apos;s
            finest coastline unfolding in every direction. Come for a long
            weekend or settle in for a slower week — either way, this is the
            kind of stay that&apos;s worth the journey north.
          </p>
          <p className="mt-6 font-medium text-foreground">
            Here&apos;s what makes a stay here different:
          </p>
          <ul className="mt-4 space-y-3 text-base">
            {whyStay.map((item) => {
              const linkIndex = item.link
                ? item.text.indexOf(item.link.word)
                : -1;
              return (
                <li key={item.text} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span className="text-muted-foreground">
                    {item.link && linkIndex !== -1 ? (
                      <>
                        {item.text.slice(0, linkIndex)}
                        <a
                          href={item.link.href}
                          className="font-semibold text-primary hover:underline"
                        >
                          {item.link.word}
                        </a>
                        {item.text.slice(linkIndex + item.link.word.length)}
                      </>
                    ) : (
                      item.text
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Dog-Friendly Self-Catering Above Gardenstown
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-foreground">
            Your dog isn&apos;t merely permitted here — they&apos;re expected,
            welcome, and every bit as much a part of the trip as you are. The
            Aberdeenshire coastline is generous with space: wide, quiet{" "}
            <Link
              href="/about#hiking-walking"
              className="font-semibold text-primary hover:underline"
            >
              cliff paths
            </Link>
            , soft sand, and shingle beaches where a spaniel can run itself
            happy.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-foreground">
            You won&apos;t spend the weekend planning around your dog. This
            stretch of coast already has them in mind, from the coastal walks
            at your door to the harbour cafés that greet a well-mannered
            companion with a smile.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
          <a
            href="/properties/muckle-view"
            className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Explore the Chalets
          </a>
        </div>
      </section>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Family Accommodation on the Aberdeenshire Coast
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-foreground">
            For families and longer stays,{" "}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
            <a
              href="/properties/murray-cottage"
              className="font-semibold text-primary hover:underline"
            >
              Murray Cottage
            </a>{" "}
            is our three-bedroom holiday home above Gardenstown, with
            sweeping Moray Firth views and room for everyone to settle in —
            whether that&apos;s a family gathering, a group of friends, or a
            slow week away from it all.
          </p>
          <p className="mt-6 text-lg leading-relaxed text-foreground">
            It&apos;s the same clifftop setting, the same open coast, with
            space to spread out and gather back together at the end of each
            day.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
          <a
            href="/properties/murray-cottage"
            className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            View the Family Home
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          Choose Your Clifftop Stay
        </h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-foreground">
          Two special properties. One unforgettable setting above the Moray
          Firth. Here&apos;s how to pick the one that suits you.
        </p>
        <div className="mt-10 grid gap-10 sm:grid-cols-2">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
          <a href="/properties/muckle-view" className="group block">
            <PropertyMedia
              image={muckleView.image}
              name={muckleView.name}
              index={0}
            />
            <div className="mt-4">
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">
                For couples and dogs
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                Muckle View
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                A contemporary dog-friendly studio chalet perched on the
                clifftop, with panoramic Moray Firth views and a log burner
                for cosy evenings in. Intimate and built for two — the ideal
                couple&apos;s coastal escape with the dog in tow.
              </p>
              <span className="mt-3 inline-block text-xs font-medium tracking-wide text-primary uppercase group-hover:underline">
                Discover Muckle View →
              </span>
            </div>
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- plain <a> forces a full reload so the Lodgify booking widget's one-time DOM scan runs fresh */}
          <a href="/properties/murray-cottage" className="group block">
            <PropertyMedia
              image={murrayCottage.image}
              name={murrayCottage.name}
              index={1}
            />
            <div className="mt-4">
              <p className="text-xs font-semibold tracking-wide text-accent uppercase">
                For families and groups
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                Murray Cottage
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Our three-bedroom family holiday home above Gardenstown, with
                sweeping Moray Firth views and room for everyone to breathe.
                Perfect for family holidays, group getaways, and slower weeks
                on the Aberdeenshire coast.
              </p>
              <span className="mt-3 inline-block text-xs font-medium tracking-wide text-primary uppercase group-hover:underline">
                Discover Murray Cottage →
              </span>
            </div>
          </a>
        </div>
      </section>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Things to Do From Your Doorstep
          </h2>
          <p className="mt-6 text-lg leading-relaxed text-foreground">
            The setting earns its keep the moment you step outside.
            Here&apos;s a taste of what&apos;s within easy reach.
          </p>
          <ul className="mt-6 space-y-4 text-base">
            {fromYourDoorstep.map((item) => {
              const linkIndex = item.link ? item.text.indexOf(item.link.word) : -1;
              return (
                <li key={item.title} className="flex gap-2">
                  <span className="text-accent">•</span>
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {item.title}:
                    </span>{" "}
                    {item.link && linkIndex !== -1 ? (
                      <>
                        {item.text.slice(0, linkIndex)}
                        <Link
                          href={item.link.href}
                          className="font-semibold text-primary hover:underline"
                        >
                          {item.link.word}
                        </Link>
                        {item.text.slice(linkIndex + item.link.word.length)}
                      </>
                    ) : (
                      item.text
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            href="/about"
            className="mt-8 inline-block rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Explore the Experiences
          </Link>
        </div>
      </section>

      <FeaturedIn />

      <Testimonials />

      <section className="px-6 py-24">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(homeFaqJsonLd) }}
        />
        <div className="mx-auto max-w-3xl">
          <h2 className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
            Planning Your Stay
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-foreground">
            A few quick answers before you book.
          </p>
          <div className="mt-8 divide-y divide-border rounded-2xl border border-border">
            {homeFaqs.map((faq) => (
              <details key={faq.question} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-foreground marker:content-none">
                  {faq.question}
                  <span
                    aria-hidden
                    className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="mt-3 leading-relaxed text-muted-foreground">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            More questions?{" "}
            <Link
              href="/faqs"
              className="font-semibold text-primary hover:underline"
            >
              See all FAQs
            </Link>
            .
          </p>
        </div>
      </section>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
          <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
            Book Your Clifftop Stay on the Aberdeenshire Coast
          </h2>
          <p className="text-muted-foreground">
            Whether it&apos;s a couple&apos;s escape with the dog or a
            family gathering above the Moray Firth, your dates are the only
            thing standing between you and the coast. The view is ready
            whenever you are.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/properties#availability"
              className="rounded-full bg-primary px-8 py-4 text-base font-semibold text-primary-foreground shadow-lg transition-colors hover:bg-primary/90"
            >
              Book Your Stay
            </Link>
            <Link
              href="/properties"
              className="rounded-full border border-primary px-7 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              View Properties
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
