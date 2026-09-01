export type Review = {
  name: string;
  context: string;
  title: string;
  text: string;
  ratingValue: number;
  datePublished: string;
};

export const reviews: Review[] = [
  {
    name: "Niels Calvert",
    context: "Guests with pets · Stayed August 2025",
    title: "A Truly Special Escape You'll Never Want to Leave",
    text: "Gamrie Chalets is a decadent bolt hole like none other. The views are simply sublime and the mesmerising landscape is ever changing minute by minute. The quality of the accommodation makes for a truly relaxing and indulgent stay where every single element has been carefully considered, making a truly special place where you can't help but kick back and relax. The hardest part is saying goodbye...",
    ratingValue: 5,
    datePublished: "2025-10-18",
  },
  {
    name: "Colin Turnbull",
    context: "Young couple · Stayed October 2025",
    title: "October Stay",
    text: "We had a lovely trip up to Gardenstown and this spot was the perfect place to relax and enjoy the incredible views. Thanks!",
    ratingValue: 5,
    datePublished: "2025-10-17",
  },
];
