export type Instruction = {
  title: string;
  steps: string;
  // Only include a verified link straight to the manufacturer's own manual
  // page/PDF — never a guessed or generic search-result URL.
  manualUrl?: string;
};

export type WelcomeGuide = {
  slug: string;
  propertyName: string;
  hostName: string;
  hostPhone: string;
  wifi: { network: string; password: string };
  overview: string[];
  arrival: {
    checkInTime: string;
    checkInNotes: string[];
    lockInstructions?: Instruction[];
    checkOutTime: string;
    checkOutNotes: string[];
    departureTasks: string[];
  };
  evCharging?: {
    intro: string;
    instructions: Instruction[];
  };
  kitchen: {
    intro: string;
    equipment: string[];
    instructions: Instruction[];
  };
  livingArea: {
    intro: string;
    features: string[];
    instructions: Instruction[];
  };
  balcony: {
    intro: string;
    features: string[];
    instructions: Instruction[];
  };
  bathroom: {
    intro: string;
    amenities: string[];
    instructions: Instruction[];
    disposalNote: string;
  };
};

export const welcomeGuides: WelcomeGuide[] = [
  {
    slug: "muckle-view",
    propertyName: "Muckle View",
    hostName: "Shaun Donaldson",
    hostPhone: "07989 225 390",
    wifi: { network: "Muckle View", password: "GamrieStay#4321" },
    overview: [
      "Sleeps two adults",
      "Well-behaved pets welcome",
      "Open-plan living and bedroom area",
      "Covered private balcony, ideal for relaxing in all weather",
      "Fully equipped separate kitchen",
      "Full shower room",
      "On-site parking available",
      "Electric vehicle charging on site (usage instructions apply)",
    ],
    arrival: {
      checkInTime: "From 3:00pm",
      checkInNotes: [
        "Your access code will be sent by message one day before arrival.",
        "Early check-in may be available on request, subject to availability.",
        "If you experience any issues accessing the property, please contact us straight away.",
      ],
      lockInstructions: [
        {
          title: "Front door lock (Ultion Nuki Smart Lock 2025)",
          steps:
            "To let yourself in, key your access code into the black keypad on the right-hand side of the front door, then press to unlock. To lock the door from inside, simply press the button in the centre of the Nuki lock. When leaving, lift the door handle to lock it, then press the arrow on the keypad to confirm it's locked. A physical key is kept as a backup — ask us if you ever need it.",
        },
      ],
      checkOutTime: "By 11:00am",
      checkOutNotes: [
        "Please ensure the property is securely locked when you leave.",
        "Late check-out may incur an additional charge unless agreed in advance.",
      ],
      departureTasks: [
        "Wash and put away any used dishes",
        "Place all rubbish in the bin under the sink",
        "Switch off lights and small appliances",
        "Close and secure all windows and doors",
      ],
    },
    evCharging: {
      intro:
        "An on-site electric vehicle charger is available, complimentary, for your use during your stay.",
      instructions: [
        {
          title: "Using the charger",
          steps:
            "An RFID tag hangs in the kitchen — tap it against the charger to start or stop a charging session. Please always return the tag to the kitchen when you're done, so it's ready for the next guest.",
          manualUrl:
            "https://download.easee.com/m/11a04672aa320755/original/EN_ChargeUp_UserGuide.pdf",
        },
      ],
    },
    kitchen: {
      intro:
        "A fully equipped separate kitchen, ideal for anything from a quick breakfast to a relaxed evening meal.",
      equipment: [
        "Nespresso Vertuo Next coffee machine with a selection of complimentary pods",
        "Kettle, toaster, microwave",
        "Bosch Serie 2 single oven",
        "Four-zone induction hob",
        "Fridge with small freezer box",
        "Pots, pans, cutlery, cooking utensils, and glassware",
      ],
      instructions: [
        {
          title: "Oven (Bosch Serie 2, HHF113BA0B)",
          steps:
            "The oven is controlled by two dials. Select a cooking function using the left dial and set the temperature with the right. The fan setting is best for most cooking.",
          manualUrl: "https://media3.bosch-home.com/Documents/9001771898_A.pdf",
        },
        {
          title: "Induction hob (CDA HN6112FR, 4-zone)",
          steps:
            "Press and hold the power button, place a pan on the chosen zone, then select the zone and adjust the heat using the controls. Lower settings are suitable for simmering and higher settings for boiling or frying.",
          manualUrl:
            "https://www.amica-international.co.uk/connector/downloads/manual/18255/HN6112FR_im.pdf",
        },
        {
          title: "Nespresso Vertuo Next",
          steps:
            "We provide a mid-range selection of pods, with enough for your stay. Lift the top lever, drop in a capsule, and close it — the machine reads a barcode on each one and automatically brews the right size and strength, so there's nothing to set manually. Just press the button once to start. If you'd like to buy more or bring your own, note that this machine only takes Vertuo-format capsules (the larger, barcoded ones) — regular Nespresso Original pods won't fit.",
          manualUrl:
            "https://www.nespresso.com/ecom/medias/sys_master/public/45692587606046/Nespresso-Vertuo-Next-User-Manual-Cluster-1-2025-06-23-compressed.pdf",
        },
      ],
    },
    livingArea: {
      intro:
        "The open-plan living and sleeping area is designed for comfort and relaxation.",
      features: [
        "King size bed with fresh linen",
        "Two chairs facing the balcony",
        "Small table with lift-off trays",
        "Pull-up blinds on the front windows",
        "Log burner with supplied logs",
      ],
      instructions: [
        {
          title: "Lighting the log burner",
          steps:
            "Open the air vents fully and place a firelighter with kindling in the centre of the burner. Light the firelighter and once the kindling is burning well, add a small log. When the fire is established, adjust the air vents to control the heat.",
        },
        {
          title: "Fire safety",
          steps:
            "Please use only the logs provided and do not overload the burner. Never leave the fire unattended and ensure it is fully extinguished before going to bed or leaving the chalet. Keep furniture, soft furnishings, and clothing well clear of the fire at all times.",
        },
      ],
    },
    balcony: {
      intro:
        "The covered balcony is a peaceful space to relax and enjoy the view throughout the year.",
      features: [
        "Two outdoor chairs provided",
        "Seat pads stored under the bed",
        "LED lights controlled by a rocker switch beside the bed",
        "Mi control box for adjusting colour and brightness",
        "External power socket for charging devices",
      ],
      instructions: [
        {
          title: "Balcony lights",
          steps:
            "First, switch on the rocker switch between the two dimmer light switches on the left side of the bed — this powers the balcony lights. Then use the MiBoxer control panel on the wall beside the right side of the balcony door: tap \"All\" to turn the lights on or off, use the white-to-black bar to set the brightness level, and use the multi-colour bar above it to pick a custom colour to suit any mood.",
        },
      ],
    },
    bathroom: {
      intro:
        "The chalet has a modern shower room fitted with an electric shower for comfort and ease of use.",
      amenities: [
        "Fresh towels provided",
        "Complimentary toiletries",
        "Two luxury robes",
      ],
      instructions: [
        {
          title: "Electric shower (AQUAS Indulge Touch Flex Smart 9.5kW)",
          steps:
            "First turn the temperature control fully down to 0. Then press the power button to switch the shower on. Next, press the button with the two lines and allow the water to run for a few seconds. Slowly increase the temperature until you reach your desired level. Electric showers take a short time to stabilise, so gradual adjustments work best.",
          manualUrl:
            "https://aquasshower.co.uk/download/264/AI0061_-_9.5kw_Instruction_rev02.pdf",
        },
      ],
      disposalNote:
        "We kindly ask that wipes, sanitary items, and food waste are not flushed.",
    },
  },
];
