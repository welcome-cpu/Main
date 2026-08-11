import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "The Estate",
  description:
    "Gamrie Chalets sits above Gardenstown on Scotland's dramatic Moray Firth coastline.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        The Estate
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        A clifftop above Gardenstown
      </h1>
      <div className="mt-10 space-y-6 text-lg leading-relaxed text-muted-foreground">
        <p>
          Gamrie Chalets sits on Scotland&apos;s dramatic coastline, above
          the fishing village of Gardenstown, looking out across the Moray
          Firth. It&apos;s a place to slow down — to watch the water change
          colour through the day and disappear into the dark at night.
        </p>
        <p>
          The Firth is home to dolphins, and clear evenings bring a real
          chance of the Northern Lights — both easily watched from the
          balcony. By day, the coastline invites wild swimming, dolphin
          trips, and long walks along the cliffs and beaches below.
        </p>
        <p>
          Each studio chalet is built for comfort: a log burner for cool
          evenings, and a window on the view that changes with every visit.
        </p>
      </div>
    </div>
  );
}
