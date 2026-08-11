import type { Metadata } from "next";
import GalleryTile from "@/components/GalleryTile";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Born and raised in Gardenstown, Shaun's family has lived in the village since it was founded in 1720 — the story behind Gamrie Chalets.",
  alternates: { canonical: "/our-story" },
};

export default function OurStoryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Our Story
      </p>
      <h1 className="mt-4 max-w-2xl text-4xl font-semibold text-foreground sm:text-5xl">
        A Home from Home in Gardenstown
      </h1>

      <div className="mt-12 grid gap-10 sm:grid-cols-2 sm:items-start">
        <GalleryTile title="" index={2} />
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
  );
}
