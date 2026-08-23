import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ImageProtection from "@/components/ImageProtection";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = {
  default: "Gamrie Chalets — Luxury Clifftop Chalets on the Moray Firth",
  template: "%s | Gamrie Chalets",
};

const description =
  "Luxury clifftop chalets above Gardenstown with panoramic views of the Moray Firth. Escape. Unwind. Recharge.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title,
  description,
  openGraph: {
    title,
    description,
    url: SITE_URL,
    siteName: SITE_NAME,
    locale: "en_GB",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

const lodgingBusinessJsonLd = {
  "@context": "https://schema.org",
  "@type": "LodgingBusiness",
  name: SITE_NAME,
  description,
  url: SITE_URL,
  email: "welcome@gamriechalets.co.uk",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Gardenstown",
    addressRegion: "Aberdeenshire",
    addressCountry: "GB",
  },
  subjectOf: [
    {
      "@type": "CreativeWork",
      headline: "Win a luxurious one-night stay for two at Gamrie Chalets",
      url: "https://www.scottishfield.co.uk/competitions/win-a-luxurious-one-night-stay-for-two-at-gamrie-chalets/",
      publisher: { "@type": "Organization", name: "Scottish Field" },
    },
  ],
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "5",
    reviewCount: "2",
  },
  review: [
    {
      "@type": "Review",
      author: { "@type": "Person", name: "Niels Calvert" },
      datePublished: "2025-10-18",
      name: "A Truly Special Escape You'll Never Want to Leave",
      reviewBody:
        "Gamrie Chalets is a decadent bolt hole like none other. The views are simply sublime and the mesmerising landscape is ever changing minute by minute. The quality of the accommodation makes for a truly relaxing and indulgent stay where every single element has been carefully considered making a truly special place where you can't help but kick back and relax. The hardest part is saying goodbye...",
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
    },
    {
      "@type": "Review",
      author: { "@type": "Person", name: "Colin Turnbull" },
      datePublished: "2025-10-17",
      name: "October Stay",
      reviewBody:
        "We had a lovely trip up to Gardenstown and this spot was the perfect place to relax and enjoy the incredible views. Thanks!",
      reviewRating: { "@type": "Rating", ratingValue: "5", bestRating: "5" },
    },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(lodgingBusinessJsonLd) }}
        />
        <ImageProtection />
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
