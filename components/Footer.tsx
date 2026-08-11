import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-12 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="text-sm font-semibold tracking-[0.2em] text-foreground-strong uppercase">
            Gamrie Chalets
          </span>
          <p className="mt-3 max-w-xs text-sm text-muted-foreground">
            Luxury clifftop chalets above Gardenstown, overlooking the Moray
            Firth.
          </p>
        </div>
        <nav className="flex flex-col gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:items-end">
          <Link href="/properties" className="hover:text-primary">
            Properties
          </Link>
          <Link href="/about" className="hover:text-primary">
            The Estate
          </Link>
          <Link href="/gallery" className="hover:text-primary">
            Gallery
          </Link>
          <Link href="/blog" className="hover:text-primary">
            Blog
          </Link>
          <Link href="/contact" className="hover:text-primary">
            Contact
          </Link>
          <a
            href="mailto:welcome@gamriechalets.co.uk"
            className="normal-case hover:text-primary"
          >
            welcome@gamriechalets.co.uk
          </a>
        </nav>
      </div>
      <div className="border-t border-border px-6 py-4 text-center text-xs text-muted-foreground">
        © {year} Gamrie Chalets. All rights reserved.
      </div>
    </footer>
  );
}
