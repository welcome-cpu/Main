import type { Metadata } from "next";
import Link from "next/link";
import { CANCELLATION_TERMS, DATE_CHANGE_TERMS } from "@/lib/booking/terms";
import { pageOpenGraph, pageTwitter } from "@/lib/metadata";

const title = "FAQs";
const description =
  "Answers to common questions about staying at Gamrie Chalets — pets, wi-fi, EV charging, check-in times, cancellations, and more.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/faqs" },
  openGraph: pageOpenGraph({ title, description, path: "/faqs" }),
  twitter: pageTwitter({ title, description }),
};

const faqs = [
  {
    question: "Do you allow pets?",
    answer:
      "Yes, we welcome dogs in our chalets, but there is a £40 surcharge to cover the additional cleaning required.",
  },
  {
    question: "Do you have free wi-fi?",
    answer:
      "Gamrie Chalets offers free wi-fi. It's worth sharing that broadband coverage in a rural area can be slower than in the city. All our TVs offer streaming as standard.",
  },
  {
    question: "Can we have an outside fire or BBQ?",
    answer:
      "It is not possible to allow external fires or BBQs in the chalets or their outside spaces, including the grass verges, driveways or ground in front of the balconies. This area attracts wildlife, and in a space with strong winds, smoke and flames cannot be safely controlled — representing a significant fire risk as well as being socially unpleasant.",
  },
  {
    question: "What are your arrival and check-out times?",
    answer:
      "Check-in is at 3pm on the day of your booked arrival. Check-out is 11am on the day of your scheduled departure. Some exceptions can be made, but this is strictly by arrangement in advance.",
  },
  {
    question: "Do you have an electric car charger?",
    answer:
      "Yes, at Muckle View. We offer guests complimentary untethered EV charging for one car per booking. Charging points are limited in the area, so we ensure your electric vehicle is ready for your next adventure. Please remember to bring your own cable.",
  },
  {
    id: "cancellation",
    question: "What is your cancellation policy?",
    answer: `${CANCELLATION_TERMS}\n\n${DATE_CHANGE_TERMS}`,
  },
  {
    question: "Are there drying or laundry facilities in the chalet?",
    answer:
      "Murray Cottage has a washing machine. Muckle View doesn't have a washing machine or tumble dryer, as part of our commitment to keeping the studio chalets sustainable — for smaller items there, you're welcome to use the bathroom to hang things, and boots or walking shoes can be stored in the porch area.",
  },
  {
    question: "Are you using local suppliers?",
    answer:
      "As an independent business, we favour suppliers who are also local, independent, and sustainable wherever possible. Scottish suppliers were used in the main, but some of the bespoke furniture and fittings were specially commissioned by a Ukrainian carpenter. Other items were sourced from Scandinavian producers. Where we favoured the “High Street”, quality providers were chosen, and we aimed to ensure their upstream supply chain was either UK or European based.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: faq.answer,
    },
  })),
};

export default function FaqsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <p className="text-xs font-semibold tracking-[0.3em] text-accent uppercase">
        FAQs
      </p>
      <h1 className="mt-4 text-4xl font-semibold text-foreground sm:text-5xl">
        Frequently Asked Questions
      </h1>
      <p className="mt-4 text-muted-foreground">
        Everything you need to know before your stay. Can&apos;t find what
        you&apos;re looking for?{" "}
        <Link
          href="/contact"
          className="font-semibold text-primary hover:underline"
        >
          Get in touch
        </Link>
        .
      </p>

      <div className="mt-10 divide-y divide-border rounded-2xl border border-border">
        {faqs.map((faq) => (
          // The booking box links to the cancellation answer, so that one starts open.
          <details
            key={faq.question}
            id={faq.id}
            open={faq.id === "cancellation"}
            className="group scroll-mt-24 px-6 py-5"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-foreground marker:content-none">
              {faq.question}
              <span
                aria-hidden
                className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-muted-foreground">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
