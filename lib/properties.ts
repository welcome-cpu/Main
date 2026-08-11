export const properties = [
  {
    slug: "muckle-view",
    name: "Muckle View",
    description:
      "A contemporary studio chalet perched on the clifftop, with panoramic views across the Moray Firth and a log burner for cosy evenings in.",
    comingSoon: false,
    image: { src: "/7907_Gamrie_High_158.jpg", width: 7871, height: 5249 },
  },
  {
    slug: "murray-cottage",
    name: "Murray Cottage",
    description:
      "A studio chalet above Gardenstown, framed by sweeping coastal views, with balcony binoculars ready for dolphins by day and the Northern Lights by night.",
    comingSoon: false,
    image: { src: "/78491_Murray-002.jpg", width: 4999, height: 3333 },
  },
  {
    slug: "mohr-rest",
    name: "Mohr Rest",
    description:
      "A new chalet joining Gamrie Chalets, currently being prepared. Details and availability coming soon.",
    comingSoon: true,
    image: { src: "/Mohr Rest - Coming Soon.jpeg", width: 1920, height: 1440 },
  },
];

export const bookableProperties = properties.filter((p) => !p.comingSoon);
