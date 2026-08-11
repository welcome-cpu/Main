export const properties = [
  {
    slug: "muckle-view",
    name: "Muckle View",
    description:
      "A contemporary studio chalet perched on the clifftop, with panoramic views across the Moray Firth and a log burner for cosy evenings in.",
    comingSoon: false,
  },
  {
    slug: "murray-cottage",
    name: "Murray Cottage",
    description:
      "A studio chalet above Gardenstown, framed by sweeping coastal views, with balcony binoculars ready for dolphins by day and the Northern Lights by night.",
    comingSoon: false,
  },
  {
    slug: "mohr-rest",
    name: "Mohr Rest",
    description:
      "A new chalet joining Gamrie Chalets, currently being prepared. Details and availability coming soon.",
    comingSoon: true,
  },
];

export const bookableProperties = properties.filter((p) => !p.comingSoon);
