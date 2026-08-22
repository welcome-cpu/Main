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
            Escape. Unwind. Recharge.
          </p>
          <div className="mt-4 flex items-center gap-4">
            <a
              href="https://www.instagram.com/gamriechalets/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Gamrie Chalets on Instagram"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                className="h-5 w-5"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <circle cx="12" cy="12" r="4" />
                <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
              </svg>
            </a>
            <a
              href="https://www.facebook.com/p/Gamrie-Chalets-61562292453618/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Gamrie Chalets on Facebook"
              className="text-muted-foreground transition-colors hover:text-primary"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                className="h-5 w-5"
              >
                <path d="M14 9h2.5V6H14c-1.93 0-3.5 1.57-3.5 3.5V12H8v3h2.5v6h3v-6h2.3l.7-3h-3v-2.2c0-.44.36-.8.8-.8Z" />
              </svg>
            </a>
          </div>
        </div>
        <nav className="flex flex-col gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:items-end">
          <Link href="/properties" className="hover:text-primary">
            Properties
          </Link>
          <Link href="/our-story" className="hover:text-primary">
            Our Story
          </Link>
          <Link href="/about" className="hover:text-primary">
            Explore Gamrie
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
        <p>© {year} Gamrie Chalets Limited. All rights reserved.</p>
        <p className="mt-1">
          Registered in Scotland no. SC786644. Registered address: Gf, 3
          Raeburn Street, Edinburgh, Scotland, EH4 1HY.
        </p>
      </div>
    </footer>
  );
}
