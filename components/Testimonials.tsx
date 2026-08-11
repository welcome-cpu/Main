const reviews = [
  {
    name: "Niels Calvert",
    context: "Guests with pets · Stayed August 2025",
    title: "A Truly Special Escape You'll Never Want to Leave",
    text: "Gamrie Chalets is a decadent bolt hole like none other. The views are simply sublime and the mesmerising landscape is ever changing minute by minute. The quality of the accommodation makes for a truly relaxing and indulgent stay where every single element has been carefully considered making a truly special place where you can't help but kick back and relax. The hardest part is saying goodbye...",
  },
  {
    name: "Colin Turnbull",
    context: "Young couple · Stayed October 2025",
    title: "October Stay",
    text: "We had a lovely trip up to Gardenstown and this spot was the perfect place to relax and enjoy the incredible views. Thanks!",
  },
];

export default function Testimonials() {
  return (
    <section className="bg-muted px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <p className="text-center text-xs font-semibold tracking-[0.3em] text-accent uppercase">
          Guest Reviews
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
