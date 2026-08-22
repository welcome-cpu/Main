export const properties = [
  {
    slug: "muckle-view",
    name: "Muckle View",
    lodgifyRentalId: "646178",
    sleeps: 2,
    description:
      "A contemporary studio chalet perched on the clifftop, with panoramic views across the Moray Firth and a log burner for cosy evenings in.",
    tagline: "For Couples and Their Dog",
    longDescription: [
      "Designed for two and genuinely built with dogs in mind, each studio chalet is design-led, beautifully finished, and shaped entirely around the view. Scottish and Scandinavian furnishings bring warm textures and natural materials into every corner, with pieces sourced from small local makers. The log burner keeps evenings cosy, while the balcony binoculars are there for dolphins, the aurora, and everything in between.",
      "These are dog-friendly chalets in Aberdeenshire where your companion is every bit as welcome as you are.",
    ],
    features: [
      "Sleeps 2",
      "Dog-friendly throughout",
      "Kitchen with coffee machine, grill, stove, microwave, oven, refrigerator, toaster",
      "Luxury bathroom with power shower & Gordon Castle toiletries",
      "Clifftop sea views over the Moray Firth",
      "Private balcony with binoculars",
      "Log burner",
      "On-site EV charging",
      "Wheelchair accessible",
    ],
    comingSoon: false,
    image: { src: "/7907_Gamrie_High_158.jpg", width: 7871, height: 5249 },
  },
  {
    slug: "murray-cottage",
    name: "Murray Cottage",
    lodgifyRentalId: "794951",
    sleeps: 6,
    description:
      "The family home above Gardenstown, with three bedrooms, sweeping views of the Moray Firth, and room for everyone to settle in.",
    tagline: "Space for Everyone",
    longDescription: [
      "More generous in scale, the family home gives you room to spread out and truly settle in without losing an ounce of the stunning setting. The same considered design runs throughout: quality furnishings, local touches, and that sweeping view of the Firth framed in every window. It's the kind of place where children remember the holiday for years, and parents finally, properly rest.",
    ],
    features: [
      "Ideal for families and larger groups – 3 bedrooms (4 beds) – Sleeps 6",
      "Sea views over the Moray Firth",
      "Log burner",
      "Kitchen with coffee machine, dishwasher, stove, microwave, oven, refrigerator, toaster, vacuum cleaner",
      "Luxury bathroom with power shower",
      "Wi-fi",
    ],
    comingSoon: false,
    image: { src: "/78491_Murray-002.jpg", width: 4999, height: 3333 },
  },
  {
    slug: "mohr-rest",
    name: "Mohr Rest",
    sleeps: 2,
    description:
      "A new chalet joining Gamrie Chalets, currently being prepared. Details and availability coming soon.",
    tagline: "For Couples and Their Dog",
    longDescription: [
      "Designed for two and genuinely built with dogs in mind, each studio chalet is design-led, beautifully finished, and shaped entirely around the view. Scottish and Scandinavian furnishings bring warm textures and natural materials into every corner, with pieces sourced from small local makers. The log burner keeps evenings cosy, while the balcony binoculars are there for dolphins, the aurora, and everything in between.",
      "These are dog-friendly chalets in Aberdeenshire where your companion is every bit as welcome as you are.",
    ],
    features: [
      "Sleeps 2",
      "Dog-friendly throughout",
      "Kitchen with coffee machine, grill, stove, microwave, oven, refrigerator, toaster",
      "Luxury bathroom with power shower & Gordon Castle toiletries",
      "Clifftop sea views over the Moray Firth",
      "Private balcony with binoculars",
      "Log burner",
      "On-site EV charging",
      "Wheelchair accessible",
    ],
    comingSoon: true,
    image: { src: "/Mohr Rest - Coming Soon.jpeg", width: 1920, height: 1440 },
  },
];

export const bookableProperties = properties.filter((p) => !p.comingSoon);
