import type { Metadata } from "next";
import Image from "next/image";

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

        <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:items-start">
          <div className="overflow-hidden rounded-2xl border border-border">
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
              Welcome to Gardenstown — known as Gamrie (pronounced
              &ldquo;Gay-m-rie&rdquo;) by the locals. It&apos;s a historic
              fishing village on the beautiful Moray Firth, its captivating
              coastline unchanged over the centuries.
            </p>
            <p>
              I was born and raised here, and my family has lived in the
              village since it was founded in 1720. With deep roots in the
              community and a genuine love for the area, I enjoy helping
              guests discover the charm, history, and natural beauty that
              make Gardenstown so special.
            </p>
            <p>
              I look forward to making your stay comfortable and memorable —
              a home from home, with modern comforts designed to let you
              relax and recharge while enjoying the views in every season
              and weather condition.
            </p>
            <p className="font-medium text-foreground">— Shaun Donaldson</p>
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
