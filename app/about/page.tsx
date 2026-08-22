import type { Metadata } from "next";
import Image from "next/image";
import GalleryTile from "@/components/GalleryTile";

export const metadata: Metadata = {
  title: "Explore Gamrie",
  description:
    "Unforgettable experiences on Scotland's Moray Firth coastline — beaches, wildlife, heritage, and whisky, all within easy reach of Gamrie Chalets.",
  alternates: { canonical: "/about" },
};

const categories = [
  {
    title: "Beaches & Coastal Walks",
    image: { src: "/7907_Gamrie_High_190.jpg", width: 7790, height: 5195 },
    intro:
      "Clean water and soft sand make this 30-mile coastline a favourite for wild swimming and beach walks.",
    items: [
      { name: "Gardenstown Beach", detail: "sandy, and the nearest to the chalets" },
      { name: "Pennan", detail: "gable-end houses running down to the sea" },
      { name: "Inverboyndie", detail: "an award-winning sand beach" },
      { name: "Whitehills", detail: "a rock beach" },
      { name: "Portsoy", detail: "sand and rock beach" },
      { name: "Sandend Bay", detail: "sandy, good for families and surfers" },
    ],
  },
  {
    title: "Wildlife",
    image: { src: "/7907_Gamrie_High_083.jpg", width: 7983, height: 5325 },
    intro: "Watch from afar, or get up close with the coastline's wildlife.",
    items: [
      { name: "Dolphin watching", detail: "on the Moray Firth" },
      { name: "Fishing trips" },
      { name: "Bird spotting", detail: "at Troup Head Nature Reserve" },
    ],
  },
  {
    title: "Heritage & History",
    image: { src: "/Duff_House.jpg", width: 992, height: 828 },
    intro: "Scandinavian influence runs through the area's history and architecture.",
    items: [
      { name: "St John's Church", detail: "Gamrie" },
      { name: "Banff Castle" },
      { name: "Duff House", detail: "Banff" },
      { name: "Slains Castle", detail: "said to have inspired Dracula" },
      { name: "Findlater Castle", detail: "a clifftop ruin dating to the mid-1200s" },
    ],
  },
  {
    title: "Harbours & Fishing Ports",
    image: { src: "/7907_Gamrie_High_186.jpg", width: 8027, height: 5354 },
    items: [
      { name: "Gardenstown Harbour" },
      { name: "Banff Harbour Marina", detail: "17th century" },
      { name: "Fraserburgh Harbour", detail: "a working port since the 16th century" },
      { name: "Peterhead Port Fish Market", detail: "Europe's largest fishing port" },
    ],
  },
  {
    title: "Whisky Distilleries",
    image: { src: "/7907_Gamrie_High_267.jpg", width: 7911, height: 5277 },
    intro: "A handful of well-known distilleries within easy driving distance:",
    items: [
      { name: "Glenglassaugh", detail: "30 minutes" },
      { name: "Strathisla", detail: "45 minutes" },
      { name: "Speyside Cooperage", detail: "1 hour" },
      { name: "The Macallan Estate", detail: "1 hour 15 minutes" },
    ],
  },
  {
    title: "Scenic Driving",
    image: { src: "/NE250.png", width: 417, height: 259, fit: "contain" as const },
    intro:
      "The North East 250 route links castles, distilleries, fishing villages, and coastal scenery across the region — one of Scotland's great road trips, right from your door.",
  },
  {
    title: "Hiking & Walking",
    image: { src: "/7907_Gamrie_High_109.jpg", width: 8192, height: 5464 },
    intro:
      "Coastal and countryside trails run in every direction. Pack proper footwear — Scottish weather can turn quickly — and the what3words app is handy for pinpointing exact locations along the way.",
  },
  {
    title: "Local Hospitality",
    image: { src: "/7907_Gamrie_High_197.jpg", width: 5373, height: 8056 },
    intro:
      "Scottish hospitality is known the world over, and a handful of local pubs and restaurants are within easy reach, some hosting seasonal events throughout the year.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Explore Gamrie
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        A Setting That Speaks for Itself
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        Gardenstown is one of those rare places that lives up to every
        photograph. Stone cottages step down the cliff face toward a working
        harbour, and high above it all sits Gamrie Chalets, with
        uninterrupted views across the full sweep of the Moray Firth.
      </p>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        From your balcony, bottlenose dolphins roll through the water below.
        On clear winter nights, the Northern Lights shimmer green along the
        horizon. There&apos;s no better seat in the house than your own with
        binoculars in hand, coffee going cold, time slowing right down.
      </p>
      <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
        Coastal walks begin at your doorstep. Cafés and restaurants wait a
        short stroll away in the village. And when you&apos;re ready to roam
        further, the Malt Whisky Trail and the wider North East Coast 250 are
        yours to explore at whatever pace suits you.
      </p>

      <div className="mt-16 grid gap-x-12 gap-y-14 sm:grid-cols-2">
        {categories.map((category, index) => (
          <div key={category.title}>
            {category.image ? (
              <div
                className={`aspect-[4/3] overflow-hidden rounded-2xl border border-border ${
                  category.image.fit === "contain" ? "bg-white" : "bg-muted"
                }`}
              >
                <Image
                  src={category.image.src}
                  alt={category.title}
                  width={category.image.width}
                  height={category.image.height}
                  className={`h-full w-full ${
                    category.image.fit === "contain"
                      ? "object-contain p-6"
                      : "object-cover"
                  }`}
                />
              </div>
            ) : (
              <GalleryTile title="" index={index} />
            )}
            <h2 className="mt-4 text-lg font-semibold text-foreground">
              {category.title}
            </h2>
            {category.intro && (
              <p className="mt-2 text-sm text-muted-foreground">
                {category.intro}
              </p>
            )}
            {category.items && (
              <ul className="mt-4 space-y-2 text-sm">
                {category.items.map((item) => (
                  <li key={item.name} className="text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {item.name}
                    </span>
                    {item.detail && <> — {item.detail}</>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>

      <p className="mt-16 border-t border-border pt-10 text-lg leading-relaxed text-muted-foreground">
        After a day exploring, come back to a warm chalet and a view that
        changes with every visit.
      </p>
    </div>
  );
}
