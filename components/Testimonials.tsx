import { reviews } from "@/lib/reviews";
import { SITE_NAME, SITE_URL } from "@/lib/site";

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
      </div>
    </section>
  );
}
