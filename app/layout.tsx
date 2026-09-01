import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
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
  default: "Luxury Dog-Friendly Self-Catering, Aberdeenshire | Gamrie Chalets",
  template: "%s | Gamrie Chalets",
};

const description =
  "Luxury dog-friendly self-catering above Gardenstown, with Moray Firth views, coastal walks, and log-burner evenings. Check availability at Gamrie Chalets.";

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
  geo: {
    "@type": "GeoCoordinates",
    latitude: 57.670563223386880,
    longitude: -2.337134626983644,
  },
  // Listed nightly rate range across both bookable chalets (Lodgify
  // original_min/max_price, checked 2026-08-29).
  priceRange: "£104–£295",
  image: [
    `${SITE_URL}/7907_Gamrie_High_158.jpg`,
    `${SITE_URL}/78491_Murray-002.jpg`,
  ],
  amenityFeature: [
    { "@type": "LocationFeatureSpecification", name: "Dog-Friendly" },
    { "@type": "LocationFeatureSpecification", name: "Log Burner" },
    { "@type": "LocationFeatureSpecification", name: "On-Site EV Charging" },
    { "@type": "LocationFeatureSpecification", name: "Clifftop Sea Views" },
  ],
  subjectOf: [
    {
      "@type": "CreativeWork",
      headline: "Win a luxurious one-night stay for two at Gamrie Chalets",
      url: "https://www.scottishfield.co.uk/competitions/win-a-luxurious-one-night-stay-for-two-at-gamrie-chalets/",
      publisher: { "@type": "Organization", name: "Scottish Field" },
    },
  ],
  // Review/AggregateRating deliberately live only on the homepage, next to
  // the <Testimonials> component (see components/Testimonials.tsx) —
  // Google requires review markup to match reviews genuinely shown on the
  // page, and this layout renders on every route.
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
        <SpeedInsights />
      </body>
    </html>
  );
}
