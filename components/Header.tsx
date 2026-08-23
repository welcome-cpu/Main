import Image from "next/image";
import Link from "next/link";

const links = [
  { href: "/properties", label: "Properties" },
  { href: "/our-story", label: "Our Story" },
  { href: "/about", label: "Explore Gamrie" },
  { href: "/gallery", label: "Gallery" },
  { href: "/blog", label: "Blog" },
  { href: "/faqs", label: "FAQs" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-5">
        <Link href="/" className="shrink-0">
          <Image
            src="/GC Logo.png"
            alt="Gamrie Chalets"
            width={449}
            height={177}
            priority
            className="h-10 w-auto"
          />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs font-medium tracking-wide text-foreground/70 uppercase">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="transition-colors hover:text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
