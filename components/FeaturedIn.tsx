import Image from "next/image";

const mentions = [
  {
    name: "Scottish Field",
    src: "/Scottish_Field_Logo_2 - Edited.png",
    width: 2123,
    height: 741,
    href: "https://www.scottishfield.co.uk/competitions/win-a-luxurious-one-night-stay-for-two-at-gamrie-chalets/",
  },
  {
    name: "The Scotsman",
    src: "/The_Scotsman_Logo_og.png",
    width: 1200,
    height: 340,
    href: "https://www.scotsman.com/",
  },
];

export default function FeaturedIn() {
  return (
    <section className="border-y border-border bg-surface px-6 py-16">
      <div className="mx-auto max-w-6xl text-center">
        <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          As Featured In
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-16 gap-y-10">
          {mentions.map((mention) => {
            const logo = (
              <Image
                src={mention.src}
                alt={mention.name}
                width={mention.width}
                height={mention.height}
                className="h-14 w-auto transition-transform hover:scale-105 sm:h-20"
              />
            );

            return mention.href ? (
              <a
                key={mention.name}
                href={mention.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Visit ${mention.name}`}
              >
                {logo}
              </a>
            ) : (
              <span key={mention.name} aria-label={mention.name}>
                {logo}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}
