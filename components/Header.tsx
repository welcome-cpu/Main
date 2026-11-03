"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  BOOK_HREF,
  SEASONAL_HIGHLIGHT,
  headerLinks,
  isCurrent,
  menuLinks,
  type NavLink,
} from "@/lib/navigation";

// Desktop: one line of links plus a Book Now button, shrinking once the
// page scrolls. Below the `nav` breakpoint (900px): logo, Book and a menu
// button opening a full-screen, keyboard-accessible menu.

function GiftIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}

const seasonal = (link: NavLink) => SEASONAL_HIGHLIGHT && link.seasonal;

function LinkLabel({ link }: { link: NavLink }) {
  return (
    <>
      {seasonal(link) && (
        <GiftIcon className="h-4 w-4 flex-none text-[#8a6d43]" />
      )}
      {link.label}
    </>
  );
}

export default function Header() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Shrink once scrolled. Two thresholds stop it flickering at the edge,
  // since shrinking the header itself moves the page slightly.
  useEffect(() => {
    const onScroll = () =>
      setScrolled((was) => (was ? window.scrollY > 8 : window.scrollY > 48));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const closeMenu = useCallback((returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) menuButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const html = document.documentElement;
    const previousOverflow = html.style.overflow;
    html.style.overflow = "hidden"; // the page behind stays put
    html.dataset.menuOpen = "true"; // hides the mobile booking bar
    closeButton.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu(true);
      } else if (e.key === "Tab" && panel.current) {
        // Keep focus inside the menu while it's open.
        const items =
          panel.current.querySelectorAll<HTMLElement>("a[href], button");
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    // Widening past the breakpoint hides the menu, so close it properly.
    const wide = window.matchMedia("(min-width: 56.25rem)");
    const onWide = () => wide.matches && closeMenu(false);

    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      html.style.overflow = previousOverflow;
      delete html.dataset.menuOpen;
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
    };
  }, [menuOpen, closeMenu]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur">
      <div
        className={`mx-auto flex h-[60px] max-w-6xl items-center justify-between gap-4 px-4 transition-[padding,height] duration-300 sm:px-6 nav:h-auto nav:gap-6 ${
          scrolled ? "nav:py-2" : "nav:py-4"
        }`}
      >
        <Link href="/" className="shrink-0" aria-label="Gamrie Chalets home">
          <Image
            src="/GC Logo.png"
            alt="Gamrie Chalets"
            width={449}
            height={177}
            priority
            className={`h-8 w-auto transition-[height] duration-300 ${scrolled ? "nav:h-8" : "nav:h-11"}`}
          />
        </Link>

        <nav
          aria-label="Main"
          className="hidden items-center gap-x-5 text-sm whitespace-nowrap nav:flex lg:gap-x-7 lg:text-[15px]"
        >
          {headerLinks.map((link) => {
            const current = isCurrent(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={current ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 text-foreground-strong decoration-primary decoration-2 underline-offset-[6px] transition-colors hover:text-primary hover:underline ${
                  current ? "font-semibold underline" : "font-medium"
                } ${seasonal(link) ? "-mx-2 rounded-full bg-oak/25 px-2 py-1" : ""}`}
              >
                <LinkLabel link={link} />
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1">
          <Link
            href={BOOK_HREF}
            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold whitespace-nowrap text-primary-foreground transition-colors hover:bg-primary/90 nav:px-5 nav:py-2.5"
          >
            <span className="nav:hidden">Book</span>
            <span className="hidden nav:inline">Book Now</span>
          </Link>
          <button
            ref={menuButton}
            type="button"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen(true)}
            className="-mr-2 flex h-12 w-12 items-center justify-center text-foreground-strong nav:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              aria-hidden="true"
              className="h-6 w-6"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Rendered on <body>: the header's blur would otherwise confine a fixed panel to the header strip. */}
      {menuOpen &&
        createPortal(
          <div
            ref={panel}
            id="site-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-background nav:hidden"
          >
            <div className="flex h-[60px] flex-none items-center justify-between border-b border-border px-4 sm:px-6">
              <Image
                src="/GC Logo.png"
                alt="Gamrie Chalets"
                width={449}
                height={177}
                className="h-8 w-auto"
              />
              <button
                ref={closeButton}
                type="button"
                aria-label="Close menu"
                onClick={() => closeMenu(true)}
                className="-mr-2 flex h-12 w-12 items-center justify-center text-foreground-strong"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="h-6 w-6"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <nav aria-label="Main" className="flex-1 px-4 py-2 sm:px-6">
              <ul className="divide-y divide-border">
                {menuLinks.map((link) => {
                  const current = isCurrent(pathname, link.href);
                  return (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        aria-current={current ? "page" : undefined}
                        onClick={() => closeMenu(false)}
                        className={`flex min-h-14 items-center gap-2 text-lg text-foreground-strong hover:text-primary ${
                          current
                            ? "font-semibold underline decoration-primary decoration-2 underline-offset-[6px]"
                            : "font-medium"
                        }`}
                      >
                        <LinkLabel link={link} />
                        {seasonal(link) && (
                          <span className="ml-auto rounded-full bg-oak/25 px-2.5 py-0.5 text-xs font-medium text-foreground">
                            Perfect for Christmas
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="flex-none border-t border-border px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-6">
              <Link
                href={BOOK_HREF}
                onClick={() => closeMenu(false)}
                className="flex min-h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Book Now
              </Link>
            </div>
          </div>,
          document.body,
        )}
    </header>
  );
}
