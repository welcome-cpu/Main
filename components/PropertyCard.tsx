import PropertyMedia from "@/components/PropertyMedia";

export default function PropertyCard({
  name,
  description,
  href,
  index = 0,
  comingSoon = false,
  image,
}: {
  name: string;
  description: string;
  href: string;
  index?: number;
  comingSoon?: boolean;
  image?: { src: string; width: number; height: number };
}) {
  return (
    // A plain <a> (not next/link) forces a full page load, so the
    // Lodgify booking widget's script — which only scans the DOM for
    // its target element once, on script load — always runs fresh
    // against exactly one instance of that element.
    <a href={href} className="group block">
      <PropertyMedia
        image={image}
        name={name}
        index={index}
        overlayLabel={comingSoon ? "Coming Soon" : undefined}
      />
      <div className="mt-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-foreground">{name}</h3>
          {comingSoon && (
            <span className="rounded-full bg-oak/30 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-foreground uppercase">
              Coming Soon
            </span>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
        <span className="mt-3 inline-block text-xs font-medium tracking-wide text-primary uppercase group-hover:underline">
          {comingSoon ? `Learn more` : `Discover ${name}`} →
        </span>
      </div>
    </a>
  );
}
