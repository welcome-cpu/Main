import { SITE_NAME } from "./site";

// Next.js does not deep-merge nested `openGraph`/`twitter` metadata objects
// across layout segments — a page-level object replaces the root's entirely,
// dropping fields (type, siteName, locale, image) that aren't restated here.
// These helpers keep every page's social metadata complete.

const DEFAULT_IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };

export function pageOpenGraph({
  title,
  description,
  path,
  images,
}: {
  title: string;
  description: string;
  path: string;
  images?: { url: string; width: number; height: number }[];
}) {
  return {
    title,
    description,
    url: path,
    siteName: SITE_NAME,
    locale: "en_GB",
    type: "website" as const,
    images: images ?? [DEFAULT_IMAGE],
  };
}

export function pageTwitter({
  title,
  description,
  images,
}: {
  title: string;
  description: string;
  images?: string[];
}) {
  return {
    card: "summary_large_image" as const,
    title,
    description,
    images: images ?? [DEFAULT_IMAGE.url],
  };
}
