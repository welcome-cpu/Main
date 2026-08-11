import type { Metadata } from "next";
import GalleryTile from "@/components/GalleryTile";

export const metadata: Metadata = {
  title: "Gallery",
  description: "A look inside and around Gamrie Chalets.",
  alternates: { canonical: "/gallery" },
};

const photos = [
  "Clifftop View",
  "Moray Firth at Dusk",
  "Studio Interior",
  "Log Burner",
  "Balcony Binoculars",
  "Coastal Path",
  "Gardenstown Harbour",
  "Dolphin Watching",
  "Northern Lights",
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
        Photos are placeholders — real chalet photography coming soon.
      </p>
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {photos.map((title, index) => (
          <GalleryTile key={title} title={title} index={index} />
        ))}
      </div>
    </div>
  );
}
