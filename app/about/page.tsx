import type { Metadata } from "next";
import Image from "next/image";
import GalleryTile from "@/components/GalleryTile";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "Explore Gamrie";
const description =
  "Unforgettable experiences on Scotland's Moray Firth coastline — beaches, wildlife, heritage, and whisky, all within easy reach of Gamrie Chalets.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/about" },
  openGraph: pageOpenGraph({ title, description, path: "/about" }),
  twitter: pageTwitter({ title, description }),
};

const categories = [
  {
    title: "Beaches & Coastal Walks",
    image: { src: "/7907_Gamrie_High_190.jpg", width: 7790, height: 5195 },
    intro:
      "Beaches and coastal walks are some of the main attractions along the 30 mile coastline. Clean water and soft sand make these spots popular for wild swimming and body boarding.",
    items: [
      { name: "Gardenstown Beach", detail: "nearest to the chalets, sandy, accessible with a gentle curve" },
      { name: "Pennan Village", detail: "a rugged village with houses built gable-end to the sea" },
      { name: "Inverboyndie", detail: "a sand beach with access via a path, recognized for its Keep Scotland Beautiful Seaside award" },
      { name: "Whitehills", detail: "a rock beach, accessible via a path" },
      { name: "Portsoy", detail: "a popular sand and rock beach, accessible from the Portsoy Caravan car park" },
      { name: "Sandend Bay", detail: "a popular sandy beach, accessible via a path and boardwalk, suitable for families and surfers" },
    ],
  },
  {
    title: "Wildlife",
    image: { src: "/7907_Gamrie_High_083.jpg", width: 7983, height: 5325 },
    intro:
      "With such a range of natural wildlife on land, in the sea and in the air, visitors can choose to watch from afar or get up close.",
    items: [
      { name: "Fishing trips" },
      { name: "Dolphin watching" },
      { name: "Bird spotting", detail: "Troup Head Nature Reserve" },
    ],
  },
  {
    title: "Heritage & History",
    image: { src: "/Duff_House.jpg", width: 992, height: 828 },
    intro:
      "The proximity of Scotland's northern coastline to the Scandinavian countries means our heritage over the many centuries has been influenced by these neighbours.",
    items: [
      {
        name: "St John's Church, Gamrie",
        detail:
          "commemorates the Scots' victory over the Danes at the Battle of the Bloody Pits in the 10th century",
      },
      {
        name: "Banff Castle",
        detail:
          "transitioned from a 12th-century motte-and-bailey fortress to the stunning Georgian mansion designed by John Adam in 1750",
      },
      {
        name: "Duff House, Banff",
        detail:
          "one of the largest and finest stately homes in the area, was designed by renowned architect Robert Adam and is now cared for by Historic Scotland",
      },
      {
        name: "Slains Castle",
        detail:
          "the inspiration for Bram Stoker's Dracula, is free to those wanting to enjoy its spooky remains",
      },
      {
        name: "Findlater Castle",
        detail:
          "built in the mid-1200s, this clifftop ruin reflects Scotland's need for strong coastal defences. Strengthened by King Alexander III ahead of a planned invasion by King Håkon IV of Norway, it marks another link to the area's Danish and Norse past",
      },
    ],
  },
  {
    title: "Harbours & Fishing Ports",
    image: { src: "/7907_Gamrie_High_186.jpg", width: 8027, height: 5354 },
    items: [
      {
        name: "Gardenstown Harbour",
        detail:
          "a small, working harbour right below the chalets, still used by local fishing boats and lobster creels",
      },
      {
        name: "Banff Harbour Marina",
        detail:
          "a historic harbour dating back to the 17th century, now home to a mix of small working fishing boats and leisure craft",
      },
      {
        name: "Fraserburgh Harbour",
        detail:
          "one of the area's largest working fishing ports, dating back to the 16th century and still supporting a busy fishing fleet today",
      },
      {
        name: "Peterhead Port Fish Market",
        detail:
          "home to Europe's largest fishing port and the UK's busiest whitefish market, where millions of pounds of fresh seafood are landed and traded daily",
      },
    ],
  },
  {
    title: "Whisky Distilleries",
    image: { src: "/7907_Gamrie_High_267.jpg", width: 7911, height: 5277 },
    intro:
      "Speyside is home to some of Scotland's finest malt and blended whisky. Nearby distilleries offer tours of their operations, including tasting experiences and that all-important gift shop.",
    items: [
      {
        name: "Glenglassaugh Distillery",
        detail:
          "roughly 30 minutes from Gardenstown, this distillery was built in 1875 near the Glassaugh Spring, known for its pure water supply",
      },
      {
        name: "Strathisla Distillery",
        detail:
          "45 minutes from Gardenstown, this distillery is known for producing the Chivas Regal brand",
      },
      {
        name: "Speyside Cooperage Visitor Attraction",
        detail:
          "roughly an hour by car from Gardenstown, this facility shows where whisky barrels are made and repaired",
      },
      {
        name: "The Macallan Estate",
        detail:
          "a 1 hour 15 minute drive from Gardenstown, this distillery has a new visitor centre",
      },
    ],
  },
  {
    title: "Scenic Driving",
    image: { src: "/NE250.png", width: 417, height: 259, fit: "contain" as const },
    intro:
      "North East 250 Route – the NE250 Trail – takes cars around the scenic coast from the road, exploring six of Scotland's most inspiring regions. Drivers and passengers will see a range of castles and ruins, whisky distilleries, and fishing villages as you travel between coastal villages and beaches and mountain roads.",
  },
  {
    title: "Hiking & Walking",
    image: { src: "/7907_Gamrie_High_109.jpg", width: 8192, height: 5464 },
    intro:
      "Whether you want a brisk hike or a casual wander, the surrounding area offers many options. Some will require suitable footwear and for the Scottish weather, we always recommend being prepared for sudden changes to the forecast. Walkers may want to use the what3words app to geo locate their movements. Here's a selection of nearby options.",
    items: [
      { name: "Gardenstown to Crovie Viewpoint" },
      { name: "Crovie, Gamrie, and St John's Kirk" },
      { name: "Gardenstown, Crovie, and 5 Farms" },
      { name: "Duff House and Montcoffer Wood" },
      { name: "Banff Harbour and Whitehills" },
      { name: "Cullen and Findlater Castle" },
      { name: "Bin of Cullen" },
    ],
  },
  {
    title: "Local Hospitality",
    image: { src: "/7907_Gamrie_High_197.jpg", width: 5373, height: 8056 },
    intro:
      "Scottish hospitality is known throughout the world, and local venues here offer a range of seasonal events.",
    items: [
      { name: "The Garden Arms", detail: "walkable" },
      { name: "The Knowes Hotel and Restaurant, MacDuff", detail: "10 minute drive" },
      { name: "The Pennan Inn", detail: "10 minute drive" },
    ],
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
          <div
            key={category.title}
            id={category.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}
          >
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
