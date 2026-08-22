import type { Metadata } from "next";
import Image from "next/image";
import GalleryTile from "@/components/GalleryTile";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A look inside and around Gamrie Chalets.",
  alternates: { canonical: "/gallery" },
};

const photos = [
  {
    title: "Clifftop View",
    image: { src: "/7907_Gamrie_High_272.jpg", width: 7874, height: 5253 },
  },
  {
    title: "Moray Firth at Dusk",
    image: { src: "/7907_Gamrie_High_058.jpg", width: 8099, height: 5402 },
  },
  {
    title: "Studio Interior",
    image: { src: "/7907_Gamrie_High_063.jpg", width: 8192, height: 5464 },
  },
  {
    title: "Log Burner",
    image: { src: "/7907_Gamrie_High_116.jpg", width: 7790, height: 5195 },
  },
  {
    title: "Balcony Binoculars",
    image: { src: "/7907_Gamrie_High_078.jpg", width: 7901, height: 5270 },
  },
  {
    title: "Coastal Path",
    image: { src: "/7907_Gamrie_High_106.jpg", width: 8192, height: 5464 },
  },
  {
    title: "Gardenstown Harbour",
    image: { src: "/7907_Gamrie_High_177.jpg", width: 8192, height: 5464 },
  },
  {
    title: "Dolphin Watching",
    image: { src: "/7907_Gamrie_High_138.jpg", width: 7983, height: 5325 },
  },
  {
    title: "Northern Lights",
    credit: "Richard Scott Photography",
    image: {
      src: "/RichardScottPhotographyRSP_website.jpg",
      width: 8256,
      height: 5504,
    },
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
        to the harbour.
      </p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((photo, index) =>
          photo.image ? (
            <figure
              key={photo.title}
              className="overflow-hidden rounded-2xl border border-border bg-surface"
            >
              <Image
                src={photo.image.src}
                alt={photo.title}
                width={photo.image.width}
                height={photo.image.height}
                className="aspect-[4/3] w-full object-cover"
              />
              <figcaption className="px-4 py-3">
                <span className="text-sm font-medium text-foreground">
                  {photo.title}
                </span>
                {photo.credit && (
                  <span className="block text-xs text-muted-foreground">
                    Photo: {photo.credit}
                  </span>
                )}
              </figcaption>
            </figure>
          ) : (
            <GalleryTile key={photo.title} title={photo.title} index={index} />
          )
        )}
      </div>
    </div>
  );
}
