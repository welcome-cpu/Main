import type { Metadata } from "next";
import Image from "next/image";
import { Dancing_Script } from "next/font/google";

const signatureFont = Dancing_Script({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Born and raised in Gardenstown, Shaun's family has lived in the village since it was founded in 1720 — the story behind Gamrie Chalets.",
  alternates: { canonical: "/our-story" },
};

const reasons = [
  {
    title: "Dolphin watching from the shore",
    body: "The Moray Firth holds one of Europe's best-known bottlenose dolphin populations. Here, sightings from the clifftop and the beach below aren't a rare treat, they're simply part of daily life.",
  },
  {
    title: "Northern Lights from the balcony",
    body: "This stretch of the North East coast sits far from city glow, giving you a real chance at the aurora on clear nights. No cold hours in a remote lay-by. Just step outside, look north, and wait. The rest is up to the sky.",
  },
  {
    title: "On the North East Coast 250",
    body: "Gamrie Chalets sits directly on this celebrated scenic route which is a natural base for exploring Aberdeenshire's coastline, castles, and distilleries entirely at your own pace.",
  },
  {
    title: "On the Malt Whisky Trail",
    body: "Some of Scotland's most storied distilleries lie within easy reach, strung along one of the world's great whisky touring routes. A day out, a dram or two, and home by the fire.",
  },
  {
    title: "Coastal walking from the door",
    body: "Cliff paths and harbour trails begin right outside, winding through some of Aberdeenshire's most striking coastal scenery. Hidden coves, sea caves, seabirds overhead and all before you've even reached for the car keys.",
  },
  {
    title: "Comfort in the details",
    body: "From the log burner to the locally sourced toiletries and luxury interiors, everything here is chosen to make you want to stay a little longer than you planned. Most guests do.",
  },
];

export default function OurStoryPage() {
  return (
    <>
      <div className="mx-auto max-w-6xl px-6 py-24">
        <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          Our Story
        </p>
        <h1 className="mt-4 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
          A Home from Home in Gardenstown
        </h1>

        <div className="mt-12 overflow-hidden">
          <div className="float-left mr-8 mb-4 w-64 overflow-hidden rounded-2xl border border-border sm:w-80">
            <Image
              src="/7907_Gamrie_High_140.jpg"
              alt="View from Gamrie Chalets over Gardenstown and the Moray Firth"
              width={7927}
              height={5288}
              className="aspect-[4/3] w-full object-cover"
            />
          </div>
          <div className="space-y-6 text-lg leading-relaxed text-muted-foreground">
            <p>
              The story of Gamrie Chalets is also tied to the history of the
              village itself.
            </p>
            <p>
              I bought the site from the local laird when it was little more
              than a row of derelict clifftop garages dating from the 1940s.
              In their working days, they had been used for mending and
              storing fishing nets — part of an industry that shaped
              generations of life in Gamrie. As the fishing industry changed
              and declined through the 20th century, the garages gradually
              fell out of use and were left to the elements.
            </p>
            <p>
              At first glance, there wasn&apos;t much to see beyond a row of
              old garages. But the location was extraordinary.
            </p>
            <p>
              Perhaps I needed to move away from Gamrie for a while to truly
              appreciate what I had grown up with — the peace, the slower
              pace of life, the character of the village and, of course,
              that incredible view across Gardenstown and the Moray Firth.
            </p>
            <p>
              When I looked at the old garages, I began to see what they
              could become. Perched high above the village, with the sea
              stretching out in front of them, there was an opportunity to
              give this forgotten little corner of Gamrie a new life.
            </p>
            <p>
              That idea eventually became Gamrie Chalets — transforming a
              site once connected to the village&apos;s fishing past into a
              place where people can come to slow down, relax and experience
              the beauty of Gamrie for themselves.
            </p>
            <p>
              The buildings may have a very different purpose today, but the
              view remains the same.
            </p>
            <p className={`${signatureFont.className} text-4xl text-foreground`}>
              Shaun W A Donaldson
            </p>
          </div>
        </div>
      </div>

      <section className="bg-muted px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="max-w-2xl text-3xl font-semibold text-foreground sm:text-4xl">
            Why Guests Keep Coming Back
          </h2>
          <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {reasons.map((reason) => (
              <div key={reason.title}>
                <h3 className="text-lg font-semibold text-foreground">
                  {reason.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {reason.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
