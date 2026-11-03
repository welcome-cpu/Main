"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOOK_HREF } from "@/lib/navigation";

// Pages where a booking bar would be in the way or pointless.
const HIDDEN = [/^\/properties$/, /^\/admin/, /^\/welcome/, /^\/book(\/|$)/];

/**
 * Slim "Check Availability" bar fixed to the bottom of the screen on
 * phones. Clears the iPhone home bar and Safari's toolbar via the safe-area
 * inset, and hides while the menu is open (see Header).
 */
export default function MobileBookBar({ chaletBookingOnPage }: { chaletBookingOnPage: boolean }) {
  const pathname = usePathname();
  if (HIDDEN.some((re) => re.test(pathname))) return null;

  // On a chalet's page, jump to its own booking section where there is one.
  const href = chaletBookingOnPage && /^\/properties\/[^/]+$/.test(pathname) ? "#book" : BOOK_HREF;

  return (
    <div className="nav:hidden [[data-menu-open]_&]:hidden">
      {/* Room at the end of the page so the bar never covers the footer. */}
      <div aria-hidden="true" className="h-[calc(4rem+env(safe-area-inset-bottom))] bg-surface" />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur">
        <Link
          href={href}
          className="flex min-h-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Check Availability
        </Link>
      </div>
    </div>
  );
}
