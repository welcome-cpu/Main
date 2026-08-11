import Image from "next/image";
import GalleryTile from "@/components/GalleryTile";

export default function PropertyMedia({
  image,
  name,
  index = 0,
  overlayLabel,
}: {
  image?: { src: string; width: number; height: number };
  name: string;
  index?: number;
  overlayLabel?: string;
}) {
  if (!image) {
    return <GalleryTile title="" index={index} />;
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <Image
        src={image.src}
        alt={name}
        width={image.width}
        height={image.height}
        className="aspect-[4/3] w-full object-cover"
        priority={index === 0}
      />
      {overlayLabel && (
        <div className="absolute inset-0 flex items-center justify-center bg-foreground/50">
          <span className="text-lg font-semibold tracking-[0.2em] text-background uppercase">
            {overlayLabel}
          </span>
        </div>
      )}
    </div>
  );
}
