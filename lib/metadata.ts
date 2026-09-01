import { SITE_NAME } from "./site";

// Next.js does not deep-merge nested `openGraph`/`twitter` metadata objects
// across layout segments — a page-level object replaces the root's entirely,
// dropping fields (type, siteName, locale, image) that aren't restated here.
// These helpers keep every page's social metadata complete.

const DEFAULT_IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };

// Raw property/blog photos run 4-20MB+ at full resolution — far past what
// Facebook, Twitter, and other crawlers reliably fetch for a link preview.
// Route through the image optimizer so social platforms get a small,
// properly-sized rendition instead of the original file.
export function socialImage(
  image: { src: string; width: number; height: number },
  targetWidth = 1200
) {
  return {
    url: `/_next/image?url=${encodeURIComponent(image.src)}&w=${targetWidth}&q=75`,
    width: targetWidth,
    height: Math.round((targetWidth * image.height) / image.width),
  };
}

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
