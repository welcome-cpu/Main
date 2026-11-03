// The site's main navigation, shared by the header and the mobile menu.

/**
 * Christmas highlight on the Gift Vouchers link (a small gift icon and a
 * warm oak accent). Set to false in January to switch it off everywhere.
 */
export const SEASONAL_HIGHLIGHT = true;

/** Where "Book Now" and "Check Availability" go: the availability search. */
export const BOOK_HREF = "/properties#availability";

export type NavLink = { href: string; label: string; seasonal?: boolean };

/** Shown in the desktop header, in this order. */
export const headerLinks: NavLink[] = [
  { href: "/properties", label: "Our Chalets" },
  { href: "/about", label: "Explore Gamrie" },
  { href: "/our-story", label: "Our Story" },
  { href: "/gallery", label: "Gallery" },
  { href: "/faqs", label: "FAQs" },
  { href: "/gift-vouchers", label: "Gift Vouchers", seasonal: true },
];

/** The mobile menu has room for everything, including Blog and Contact. */
export const menuLinks: NavLink[] = [
  ...headerLinks,
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
];

/** Whether a link belongs to the page being viewed (a section counts too). */
export function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
