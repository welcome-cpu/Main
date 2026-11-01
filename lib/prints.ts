// Artwork on display in the chalets that guests can buy from the welcome
// guide. Prices live here, server-side: the checkout never trusts a price
// sent from the browser.

export type Print = {
  slug: string;
  title: string;
  artist: string;
  description: string;
  pricePence: number;
  image: { src: string; width: number; height: number };
  /** The welcome guide (chalet) it hangs in. */
  guideSlug: string;
  /** The chalet guests take it home from. */
  chaletName: string;
};

export const prints: Print[] = [
  {
    slug: "first-view-of-crovie",
    title: "First View of Crovie",
    artist: "Joyce Taylor",
    description: "A limited edition print of the picture on display in Muckle View.",
    pricePence: 7500,
    image: { src: "/prints/first-view-of-crovie.png", width: 493, height: 485 },
    guideSlug: "muckle-view",
    chaletName: "Muckle View",
  },
];

export const printsForGuide = (guideSlug: string) => prints.filter((p) => p.guideSlug === guideSlug);
export const findPrint = (slug: string) => prints.find((p) => p.slug === slug);
