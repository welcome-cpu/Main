const GRADIENTS = [
  "from-primary/80 to-accent/70",
  "from-accent/70 to-oak/50",
  "from-primary/70 to-oak/40",
  "from-oak/60 to-surface",
];

export default function GalleryTile({
  title,
  index = 0,
}: {
  title: string;
  index?: number;
}) {
  const gradient = GRADIENTS[index % GRADIENTS.length];

  return (
    <figure className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div
        className={`aspect-[4/3] w-full bg-gradient-to-br ${gradient}`}
        aria-hidden
      />
      {title && (
        <figcaption className="px-4 py-3 text-sm font-medium text-foreground">
          {title}
        </figcaption>
      )}
    </figure>
  );
}
