import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQs",
  description:
    "Answers to common questions about staying at Gamrie Chalets — pets, wi-fi, EV charging, check-in times, cancellations, and more.",
  alternates: { canonical: "/faqs" },
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
      "Gamrie Chalets offers guests complimentary untethered EV charging for one car per booking. Charging points are limited in the area, so we ensure your electric vehicle is ready for your next adventure. Please remember to bring your own cable.",
  },
  {
    question: "What is your cancellation policy?",
    answer:
      "A 50% payment is due at the time of booking, with the balance payable 7 days before arrival. Please note that all payments are non-refundable, so we recommend arranging travel insurance to cover unforeseen circumstances. No security deposit is required, and quotes remain valid for 48 hours.",
  },
  {
    question: "Are there drying or laundry facilities in the chalet?",
    answer:
      "We don't provide a washing machine or tumble dryer, as part of our commitment to keeping the chalets sustainable. For smaller items, you're welcome to use the bathroom to hang things, and boots or walking shoes can be stored in the porch area.",
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
        <a
          href={`${SITE_URL}/contact`}
          className="font-semibold text-primary hover:underline"
        >
          Get in touch
        </a>
        .
      </p>

      <div className="mt-10 divide-y divide-border rounded-2xl border border-border">
        {faqs.map((faq) => (
          <details key={faq.question} className="group px-6 py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-foreground marker:content-none">
              {faq.question}
              <span
                aria-hidden
                className="shrink-0 text-lg text-muted-foreground transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              {faq.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
