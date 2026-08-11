import Link from "next/link";
import GalleryTile from "@/components/GalleryTile";

export default function PropertyCard({
  name,
  description,
  href,
  index = 0,
}: {
  name: string;
  description: string;
  href: string;
  index?: number;
}) {
  return (
    <Link href={href} className="group block">
      <GalleryTile title="" index={index} />
      <div className="mt-4">
        <h3 className="text-lg font-semibold text-foreground">{name}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <span className="mt-3 inline-block text-xs font-medium tracking-wide text-primary uppercase group-hover:underline">
          Discover {name} →
        </span>
      </div>
    </Link>
  );
}
