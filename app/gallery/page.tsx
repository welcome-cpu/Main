import type { Metadata } from "next";
import GalleryCategoryTile from "@/components/GalleryCategoryTile";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "Gallery";
const description =
  "Real photos from Gamrie Chalets — clifftop views, cosy interiors, chalet exteriors, and the Gardenstown coastline.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/gallery" },
  openGraph: pageOpenGraph({ title, description, path: "/gallery" }),
  twitter: pageTwitter({ title, description }),
};

const categories = [
  {
    title: "Views",
    photos: [
      {
        src: "/7907_Gamrie_High_058.jpg",
        width: 8099,
        height: 5402,
        alt: "The Moray Firth at dusk",
      },
      {
        src: "/7907_Gamrie_High_272.jpg",
        width: 7874,
        height: 5253,
        alt: "Clifftop view over the Moray Firth",
      },
      {
        src: "/Muckle View/12.jpg",
        width: 1920,
        height: 1280,
        alt: "Sunset silhouette over the coast",
      },
      {
        src: "/Muckle View/13.jpg",
        width: 1920,
        height: 1280,
        alt: "Gardenstown and the bay from Muckle View",
      },
      {
        src: "/Muckle View/22.jpg",
        width: 1920,
        height: 1281,
        alt: "Twilight sea view through the gable window",
      },
      {
        src: "/Murray Cottage/1.jpg",
        width: 1920,
        height: 1280,
        alt: "Coastal view from the lounge at Murray Cottage",
      },
      {
        src: "/Murray Cottage/5.jpg",
        width: 1920,
        height: 1280,
        alt: "Headland view with seabirds overhead",
      },
      {
        src: "/Murray Cottage/6.jpg",
        width: 1920,
        height: 1280,
        alt: "The rugged coastline near Gardenstown",
      },
      {
        src: "/Murray Cottage/7.jpg",
        width: 1920,
        height: 1280,
        alt: "A fishing boat working the bay",
      },
      {
        src: "/Murray Cottage/10.jpg",
        width: 1920,
        height: 1280,
        alt: "Sunset over the headland",
      },
    ],
  },
  {
    title: "Interiors",
    photos: [
      {
        src: "/7907_Gamrie_High_063.jpg",
        width: 8192,
        height: 5464,
        alt: "Studio chalet interior",
      },
      {
        src: "/7907_Gamrie_High_116.jpg",
        width: 7790,
        height: 5195,
        alt: "Log burner on a cosy evening",
      },
      {
        src: "/7907_Gamrie_High_138.jpg",
        width: 7983,
        height: 5325,
        alt: "Binoculars ready for the balcony",
      },
      {
        src: "/7907_Gamrie_High_228.jpg",
        width: 8158,
        height: 5441,
        alt: "The resident dog by the log burner",
      },
      {
        src: "/Muckle View/23.jpg",
        width: 1920,
        height: 1280,
        alt: "Bedroom with sea-view windows",
      },
      {
        src: "/Muckle View/25.jpg",
        width: 1920,
        height: 1281,
        alt: "Reading chair with a tartan throw",
      },
      {
        src: "/Muckle View/26.jpg",
        width: 1920,
        height: 1280,
        alt: "Bed linen and cushions",
      },
      {
        src: "/Muckle View/28.jpg",
        width: 1920,
        height: 1281,
        alt: "Reflection of the vaulted ceiling",
      },
      {
        src: "/Muckle View/29.jpg",
        width: 1920,
        height: 1280,
        alt: "The statement pendant light",
      },
      {
        src: "/Muckle View/30.jpg",
        width: 1920,
        height: 1281,
        alt: "Bedside lighting detail",
      },
      {
        src: "/Muckle View/31.jpg",
        width: 1920,
        height: 1280,
        alt: "Bedside table with a book",
      },
      {
        src: "/Muckle View/35.jpg",
        width: 1920,
        height: 1281,
        alt: "Log burner and armchair",
      },
      {
        src: "/Muckle View/40.jpg",
        width: 1920,
        height: 1280,
        alt: "Coffee machine detail",
      },
      {
        src: "/Muckle View/42.jpg",
        width: 1920,
        height: 1281,
        alt: "Bathroom toiletries detail",
      },
      {
        src: "/Murray Cottage/12.jpg",
        width: 1920,
        height: 2880,
        alt: "Reading corner by the log burner",
      },
      {
        src: "/Murray Cottage/13.jpg",
        width: 1920,
        height: 1280,
        alt: "Dining table at Murray Cottage",
      },
      {
        src: "/Murray Cottage/20.jpg",
        width: 1920,
        height: 1280,
        alt: "Living room at Murray Cottage",
      },
      {
        src: "/Murray Cottage/23.jpg",
        width: 1920,
        height: 1280,
        alt: "Kitchen at Murray Cottage",
      },
      {
        src: "/Murray Cottage/24.jpg",
        width: 1920,
        height: 1280,
        alt: "Hallway with a sea view beyond",
      },
      {
        src: "/Murray Cottage/30.jpg",
        width: 1920,
        height: 1280,
        alt: "Bedroom with a clifftop view",
      },
    ],
  },
  {
    title: "External",
    photos: [
      {
        src: "/7907_Gamrie_High_158.jpg",
        width: 7871,
        height: 5249,
        alt: "Muckle View exterior",
      },
      {
        src: "/78491_Murray-002.jpg",
        width: 4999,
        height: 3333,
        alt: "Murray Cottage exterior",
      },
      {
        src: "/Muckle View/2.jpg",
        width: 1920,
        height: 1281,
        alt: "Muckle View among the village rooftops",
      },
      {
        src: "/Muckle View/4.jpg",
        width: 1920,
        height: 1280,
        alt: "The clifftop terrace at Muckle View",
      },
      {
        src: "/Muckle View/10.jpg",
        width: 1920,
        height: 1280,
        alt: "Sunset from the balcony",
      },
      {
        src: "/Muckle View/19.jpg",
        width: 1668,
        height: 2500,
        alt: "Gamrie Chalets gin on the terrace",
      },
      {
        src: "/Murray Cottage/3.jpg",
        width: 1920,
        height: 1280,
        alt: "The Murray Cottage nameplate",
      },
    ],
  },
  {
    title: "Area",
    photos: [
      {
        src: "/7907_Gamrie_High_177.jpg",
        width: 8192,
        height: 5464,
        alt: "Gardenstown Harbour",
      },
      {
        src: "/7907_Gamrie_High_186.jpg",
        width: 8027,
        height: 5354,
        alt: "Harbours and fishing ports along the coast",
      },
      {
        src: "/7907_Gamrie_High_190.jpg",
        width: 7790,
        height: 5195,
        alt: "Sandy beaches along the coast",
      },
      {
        src: "/7907_Gamrie_High_197.jpg",
        width: 5373,
        height: 8056,
        alt: "Local hospitality in the village",
      },
      {
        src: "/7907_Gamrie_High_203.jpg",
        width: 7983,
        height: 5325,
        alt: "Coastal scenery near Gardenstown",
      },
      {
        src: "/Muckle View/11.jpg",
        width: 1920,
        height: 1280,
        alt: "The Northern Lights over Gardenstown",
      },
    ],
  },
  {
    title: "Gamrie Through the Years",
    photos: [
      {
        src: "/Historic_Photos/0E74BD65-ABB2-439C-8112-25E58B16E9CC_1_105_c.jpeg",
        width: 1024,
        height: 769,
        alt: "Fisherwomen carrying creels along the shore path, historic photo",
      },
      {
        src: "/Historic_Photos/293AA2E8-CCAC-44A8-A132-B4C93406C653_1_105_c.jpeg",
        width: 1017,
        height: 772,
        alt: "A fishing fleet crowds Gardenstown harbour, historic photo",
      },
      {
        src: "/Historic_Photos/2CF8DF77-9D2E-4CD9-A989-2ABB11BDE19C_1_105_c.jpeg",
        width: 1029,
        height: 763,
        alt: "Villagers gathered by the harbour wall, historic photo",
      },
      {
        src: "/Historic_Photos/43EF3008-A32A-4C6E-A968-DB39057E3D13_1_105_c.jpeg",
        width: 1165,
        height: 675,
        alt: "Boats moored either side of the harbour breakwater, historic photo",
      },
      {
        src: "/Historic_Photos/7D78596A-01EB-48E7-BA2B-A7BBA8F79570_1_105_c.jpeg",
        width: 1089,
        height: 722,
        alt: "A painted view of the village and shore beneath the cliffs",
      },
      {
        src: "/Historic_Photos/9FD14984-6079-432F-A7C0-2C207411F2E4_1_105_c.jpeg",
        width: 1529,
        height: 514,
        alt: "Panoramic view of steam drifters crowding the harbour, historic photo",
      },
      {
        src: "/Historic_Photos/A421B559-8469-4516-9145-32E16C546492_1_105_c.jpeg",
        width: 1000,
        height: 786,
        alt: "The old kirk and graveyard overlooking the bay, historic photo",
      },
      {
        src: "/Historic_Photos/CCI10212024.jpg",
        width: 3436,
        height: 2479,
        alt: "Sepia panorama of the terraced cottages beneath the cliffs, historic photo",
      },
      {
        src: "/Historic_Photos/DB0A7A98-CBC0-4E70-ADA2-873E6CA304A2_1_105_c.jpeg",
        width: 1032,
        height: 762,
        alt: "An old view of the bay and village beneath the headland, historic photo",
      },
    ],
  },
];

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-24">
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        Gallery
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        A glimpse of the coast
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        A look inside the chalets and around Gardenstown, from the clifftop
        to the harbour. Select a tile to browse the full set.
      </p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2">
        {categories.map((category, index) => {
          const isTrailingOdd =
            categories.length % 2 !== 0 && index === categories.length - 1;
          return (
            <div
              key={category.title}
              className={isTrailingOdd ? "sm:col-span-2 sm:mx-auto sm:w-1/2" : undefined}
            >
              <GalleryCategoryTile title={category.title} photos={category.photos} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
