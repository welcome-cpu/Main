import PropertyMedia from "@/components/PropertyMedia";

// Plain <a> links (not next/link) force a full page load, so the Lodgify
// booking widget's script, which only scans the DOM for its target element
// once on script load, always runs fresh against exactly one instance of it.

export default function PropertyCard({
  name,
  description,
  href,
  bookHref,
  facts = [],
  wide = false,
  index = 0,
  comingSoon = false,
  image,
}: {
  name: string;
  description: string;
  href: string;
  /** Where the Book button goes; no button without it. */
  bookHref?: string;
  /** Short key facts shown under the description, e.g. "Sleeps 2". */
  facts?: string[];
  /** Image beside the text on desktop, for a card that stands apart. */
  wide?: boolean;
  index?: number;
  comingSoon?: boolean;
  image?: { src: string; width: number; height: number };
}) {
  return (
    <article className={wide ? "grid gap-6 md:grid-cols-2 md:items-center md:gap-10" : ""}>
      <a href={href} className="block" tabIndex={-1} aria-hidden="true">
        <PropertyMedia image={image} name={name} index={index} overlayLabel={comingSoon ? "Coming Soon" : undefined} />
      </a>
      <div className={wide ? "" : "mt-4"}>
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold text-foreground ${wide ? "text-2xl" : "text-lg"}`}>
            <a href={href} className="hover:underline">
              {name}
            </a>
          </h3>
          {comingSoon && (
            <span className="rounded-full bg-oak/30 px-2.5 py-0.5 text-[10px] font-semibold tracking-wide text-foreground uppercase">
              Coming Soon
            </span>
          )}
        </div>
        <p className={`mt-1 leading-relaxed text-muted-foreground ${wide ? "text-base" : "text-sm"}`}>{description}</p>
        {facts.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-x-2 gap-y-1.5 text-xs font-medium text-foreground" aria-label="Key facts">
            {facts.map((fact) => (
              <li key={fact} className="rounded-full border border-border bg-background px-2.5 py-1">
                {fact}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
          {bookHref && !comingSoon && (
            <a
              href={bookHref}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Book {name}
            </a>
          )}
          <a href={href} className="text-xs font-medium tracking-wide text-primary uppercase hover:underline">
            {comingSoon ? "Learn more" : `Discover ${name}`} →
          </a>
        </div>
      </div>
    </article>
  );
}
