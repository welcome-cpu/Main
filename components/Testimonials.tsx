import Link from "next/link";
import { reviews } from "@/lib/reviews";
import { SITE_NAME, SITE_URL } from "@/lib/site";

// Opens Gamrie Chalets' reviews on Google, where guests can add their own.
const GOOGLE_REVIEW_URL =
  "https://www.google.com/travel/search?q=gamrie%20chalets&g2lb=4965990%2C72471280%2C72573224%2C72647020%2C72686036%2C72803964%2C72882230%2C73064764%2C121529350%2C121608706%2C121738283%2C121921501%2C121951222%2C121960737%2C122078727%2C122093076%2C122097177%2C122192361&hl=en-GB&gl=uk&cs=1&ssta=1&ts=CAEaKwopEicyJTB4NDg4NDhiNmQ4ZjZmOTk1OToweDRhOTQxZDhkMTJmNzRlNGU&qs=CAEyE0Nnb0l6cHpkbDlHeGg4cEtFQUU4Ag&ap=ugEHcmV2aWV3cw&ictx=111&ved=0CAAQ5JsGahcKEwiIlMbgv-eXAxUAAAAAHQAAAAAQBg";

// Review/AggregateRating schema lives here, next to the reviews it
// describes, so it can only ever appear on a page where they're actually
// rendered — Google requires review markup to match visible content.
const reviewJsonLd = {
  "@context": "https://schema.org",
  "@type": "LodgingBusiness",
  name: SITE_NAME,
  url: SITE_URL,
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: (
      reviews.reduce((sum, review) => sum + review.ratingValue, 0) / reviews.length
    ).toFixed(1),
    reviewCount: String(reviews.length),
  },
  review: reviews.map((review) => ({
    "@type": "Review",
    author: { "@type": "Person", name: review.name },
    datePublished: review.datePublished,
    name: review.title,
    reviewBody: review.text,
    reviewRating: {
      "@type": "Rating",
      ratingValue: String(review.ratingValue),
      bestRating: "5",
    },
  })),
};

export default function Testimonials() {
  return (
    <section className="bg-muted px-6 py-24">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(reviewJsonLd) }}
      />
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          What Our Guests Say About Gamrie Chalets
        </h2>
        <p className="mt-4 text-center text-base text-muted-foreground">
          Read why guests return to our clifftop chalets above the Moray
          Firth.
        </p>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {reviews.map((review) => (
            <div
              key={review.name}
              className="rounded-2xl border border-border bg-background p-8"
            >
              <div className="text-oak" aria-hidden>
                ★★★★★
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">
                {review.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                &ldquo;{review.text}&rdquo;
              </p>
              <p className="mt-6 text-sm font-medium text-foreground">
                {review.name}
              </p>
              <p className="text-xs text-muted-foreground">{review.context}</p>
            </div>
          ))}
        </div>
        <div className="mt-12 rounded-2xl border border-border bg-background p-8 text-center">
          <h3 className="text-lg font-semibold text-foreground">Stayed with us?</h3>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
            We&apos;d love to hear how it went. A Google review only takes a minute and helps other
            guests find us. And if you&apos;re already missing the view, your chalet is waiting.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={GOOGLE_REVIEW_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-primary px-7 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/10"
            >
              Leave a Google review
            </a>
            <Link
              href="/properties#availability"
              className="rounded-full bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Book a return visit
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
