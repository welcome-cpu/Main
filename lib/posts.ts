export type ContentBlock =
  | { type: "paragraph"; text: string; links?: { word: string; href: string }[] }
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "list"; items: string[] }
  | { type: "cta"; label: string; href: string }
  | { type: "ctaGroup"; items: { label: string; href: string }[] };

export type Post = {
  slug: string;
  title: string;
  metaTitle?: string;
  date: string;
  excerpt: string;
  image?: { src: string; width: number; height: number };
  content: ContentBlock[];
};

export const posts: Post[] = [
  {
    slug: "family-friendly-3-day-aberdeenshire-coast-itinerary",
    title: "A Family-Friendly 3-Day Aberdeenshire Coast Itinerary from Gamrie Chalets",
    metaTitle: "3-Day Family Coast Itinerary, Aberdeenshire",
    date: "2026-08-15",
    excerpt:
      "A family-friendly 3-day Aberdeenshire coast itinerary: beaches, dolphins, castles, and cliff walks from your clifftop base. Book your stay at Gamrie Chalets.",
    image: { src: "/7907_Gamrie_High_203.jpg", width: 7983, height: 5325 },
    content: [
      {
        type: "paragraph",
        text: "The best family holidays strike a quiet balance. Enough to fill the days, but never so much that everyone arrives home needing another break. Room to explore, and room to do absolutely nothing at all. That's the rhythm this stretch of the Aberdeenshire coast does so well, and from a clifftop base above Gardenstown, the North East is right on your doorstep.",
      },
      {
        type: "paragraph",
        text: "Gamrie Chalets sits high above the Moray Firth, where the coastline of fishing villages and farming communities offers families both nature and heritage in easy reach. Our family home (it was my grandmother's) gives everyone space to spread out, with sea views from the windows, a log burner for the evenings, and coastal paths beginning at the door. Over the next three days, you'll walk cliff trails, spot dolphins and seabirds, poke around castles and harbours, and find beaches for every mood.",
      },
      { type: "cta", label: "Check Availability", href: "/properties/murray-cottage" },
      { type: "heading", level: 2, text: "Day 1: Settling In and Finding Your Feet" },
      { type: "heading", level: 3, text: "Arrive and Let the Drive Fall Away" },
      {
        type: "paragraph",
        text: "However far you've come, the moment the sea appears the journey starts to feel worth it. Pull up at the family home, plug the car into the on-site EV charging, and let everyone claim their favourite spot by the window. Kids gravitate to the view. Adults gravitate to the kettle. That's the natural order of things.",
      },
      {
        type: "paragraph",
        text: "There's no rush on a first afternoon. Unpack slowly, then head down to Gardenstown Beach, the nearest to the house. It's sandy, easy to reach, and curves in a gentle arc that's perfect for a first paddle and a stone-skimming contest before dinner.",
      },
      { type: "cta", label: "See our family-friendly home from home", href: "/properties/murray-cottage" },
      { type: "heading", level: 3, text: "A First Look at the Harbour" },
      {
        type: "paragraph",
        text: "When you're ready to stretch further, wander into Gardenstown itself. The village steps down the cliff face in tight rows of stone cottages toward a working harbour. Children love the tumbledown geometry of it — the steep lanes, the bobbing boats, the smell of salt and seaweed.",
        links: [{ word: "Gardenstown", href: "/about" }],
      },
      {
        type: "paragraph",
        text: "Wander around the harbour wall, count the fishing boats, and see who spots the first seal. It's a small place, but the kind that rewards slow exploring.",
      },
      { type: "heading", level: 3, text: "Dinner at The Garden Arms" },
      {
        type: "paragraph",
        text: "For your first evening, you don't even need the car. The Garden Arms is an easy walk from the village and a relaxed spot for a family dinner, with the boats bobbing nearby. Then it's back up to the chalet to light the log burner and let the day wind down. There's something about a fire and a big view that settles a family. A gentle start, and a good one.",
        links: [{ word: "The Garden Arms", href: "https://thegardenarms.com/" }],
      },
      { type: "heading", level: 2, text: "Day 2: Coastal Walks and Wildlife on the Doorstep" },
      { type: "heading", level: 3, text: "Morning on the Cliff Paths" },
      {
        type: "paragraph",
        text: "This is the day the setting truly earns its keep. The coastal walks begin steps from the door, and two routes suit families especially well. The Gardenstown to Crovie Viewpoint trail is a manageable there-and-back with a huge payoff in a clifftop view over the tiny gable-end village of Crovie below. For a slightly longer loop with a dose of history, the Crovie, Gamrie, and St John's Kirk circular threads coast and countryside together.",
        links: [
          {
            word: "Gardenstown to Crovie Viewpoint trail",
            href: "https://www.alltrails.com/en-gb/trail/scotland/aberdeenshire/gardenstown-to-crovie-viewpoint",
          },
          {
            word: "Crovie, Gamrie, and St John's Kirk circular",
            href: "https://www.alltrails.com/en-gb/trail/scotland/aberdeenshire/crovie-gamrie-and-st-john-s-kirk-circular",
          },
        ],
      },
      {
        type: "paragraph",
        text: "Pack a flask, hand out the binoculars, and set off at whatever pace the youngest can manage. The paths reward curious eyes with seabirds overhead, rock pools at the bottom of the descents, and sea caves where you least expect them. Turn it into a treasure hunt and the miles pass without a single complaint.",
      },
      { type: "heading", level: 3, text: "Watching for Dolphins and Seabirds" },
      {
        type: "paragraph",
        text: "The Moray Firth is home to one of Europe's largest populations of bottlenose dolphins, and few things thrill a child quite like the first dark fin breaking the surface. On a clear morning you might catch a whole pod rolling past, close enough from the clifftop to hear them breathe.",
      },
      {
        type: "paragraph",
        text: "For an unforgettable morning, drive a few minutes to Troup Head Nature Reserve, Scotland's only mainland gannet colony. Thousands of seabirds wheel and dive along the cliffs here, and it's a proper spectacle for wildlife-mad kids. If you've a keen young angler in the family, local fishing trips run from nearby harbours too.",
        links: [
          { word: "Troup Head Nature Reserve", href: "https://www.rspb.org.uk/days-out/reserves/troup-head" },
        ],
      },
      { type: "heading", level: 3, text: "Lunch in the Village" },
      {
        type: "paragraph",
        text: "When appetites catch up, head down to Bumble & Brae, a genuine village gem near the harbour. It's the top-rated spot in Gardenstown for good reason, with home-baked scones, hearty soups, proper coffee, and cakes that make choosing a real challenge. There's a lovely seating area out the back, and a warm welcome for families and dogs alike.",
      },
      { type: "heading", level: 3, text: "An Easy Afternoon and Dinner Out" },
      {
        type: "paragraph",
        text: "Spend the afternoon back at the beach, building whatever the tide allows. For dinner, it's worth the short hop to The Knowes Hotel and Restaurant in MacDuff, around ten minutes away, for a warm welcome and a proper coastal menu. Bring a couple of towels — between the sea spray and every irresistible rock pool, a damp child or two is more or less guaranteed.",
        links: [
          { word: "The Knowes Hotel and Restaurant", href: "https://knoweshotelandrestaurant.co.uk/" },
        ],
      },
      { type: "heading", level: 2, text: "Day 3: Castles, Beaches, and the North East 250" },
      { type: "heading", level: 3, text: "Take to the Scenic Route" },
      {
        type: "paragraph",
        text: "Save your third day for going a little further afield. Gamrie Chalets sits directly on the North East 250, one of Scotland's great scenic drives, so the whole region unfolds straight from your doorstep. Pack the car and set off along the coast at your own pace.",
        links: [{ word: "North East 250", href: "https://www.northeast250.com/see-the-route/" }],
      },
      { type: "heading", level: 3, text: "A Morning of Heritage" },
      {
        type: "paragraph",
        text: "This coast wears its history openly, and much of it is right up a child's street. Just along the way, Duff House in Banff is one of the finest stately homes in the area, designed by Robert Adam and set in walkable grounds. Nearby Banff Castle traces a story from 12th-century fortress to Georgian mansion. And back closer to home, St John's Church, Gamrie marks a Scots victory over the Danes in the 10th century. It's the kind of gory-sounding tale that keeps young imaginations busy.",
        links: [
          { word: "Duff House", href: "https://www.visitscotland.com/info/see-do/duff-house-p246341" },
          { word: "Banff Castle", href: "https://banffcastle.co.uk/about/" },
          {
            word: "St John's Church, Gamrie",
            href: "https://en.wikipedia.org/wiki/St_John%27s_Church,_Gamrie",
          },
        ],
      },
      { type: "heading", level: 3, text: "Beaches for Every Mood" },
      {
        type: "paragraph",
        text: "The coastline strings together some wonderful family beaches. Sandend Bay is a favourite with a broad sweep of sand reached by a path and boardwalk, popular with families and surfers alike. Inverboyndie is another gentle choice, a sandy beach with an award for cleanliness and easy access. Pick one, spread out the picnic, and let the afternoon run long.",
      },
      { type: "heading", level: 3, text: "The Malt Whisky Trail, for the Grown-Ups" },
      {
        type: "paragraph",
        text: "For the adults, a distillery stop slots neatly into the drive. Glenglassaugh, roughly thirty minutes from Gardenstown, was built in 1875 beside the pure Glassaugh Spring and offers tours and tastings. One parent can enjoy a dram while the other explores the grounds with the children — a little something for everyone, without anyone feeling left out.",
        links: [{ word: "Glenglassaugh", href: "https://www.glenglassaugh.com/" }],
      },
      { type: "heading", level: 3, text: "One Last Evening by the Fire" },
      {
        type: "paragraph",
        text: "Come back as the light softens, and if it's an early-dinner sort of evening, The Pennan Inn is a characterful ten-minute drive away in its famous cliff-hugging village. Then kick off your boots and settle in for a final evening around the log burner. On a clear winter night, this north-facing coast even offers a chance at the Northern Lights — a green shimmer along the horizon that turns an ordinary evening into one nobody forgets.",
        links: [{ word: "The Pennan Inn", href: "https://thepennaninn.co.uk/" }],
      },
      {
        type: "paragraph",
        text: "That's three days. Enough adventure to feel like a proper holiday, enough downtime to feel genuinely rested.",
      },
      { type: "heading", level: 2, text: "A Few Notes for Families" },
      {
        type: "paragraph",
        text: "A handful of small things that make the coast easier with children in tow:",
      },
      {
        type: "list",
        items: [
          "On the paths: cliff routes can be steep and exposed in places. Keep little ones close near the edges, especially in strong wind, and pack suitable footwear.",
          "Timing the tides: the beaches below reward a check of the tide times before you head down.",
          "Layers: the weather here changes its mind quickly. Waterproofs and spare socks earn their keep.",
          "Stay found: the what3words app is handy for pinpointing your spot on longer clifftop walks.",
          "Rest days: build in slow mornings. The view from the window is an activity in itself.",
        ],
      },
      { type: "heading", level: 2, text: "Your Clifftop Base Awaits" },
      {
        type: "paragraph",
        text: "An Aberdeenshire family holiday asks very little and gives a great deal back — cliff walks and gannet colonies, dolphins over breakfast, castles and harbours, sandy bays, and a warm home to return to each evening. The children get an adventure they'll talk about for years. You get the beauty and the ease you came for.",
      },
      {
        type: "paragraph",
        text: "If three days (or longer) of coastal walks, wildlife watching, and firelit evenings sounds like your kind of escape, the coast is ready whenever you are. Check availability at Gamrie Chalets and find the dates that suit your family best.",
      },
      { type: "cta", label: "Check Availability", href: "/properties/murray-cottage" },
    ],
  },
  {
    slug: "dog-friendly-weekend-gardenstown",
    title:
      "A Dog-Friendly Weekend in Gardenstown: Coastal Walks, Whisky, and Clifftop Stays",
    metaTitle: "Dog-Friendly Weekend in Gardenstown",
    date: "2025-10-20",
    excerpt:
      "A 3-day dog-friendly itinerary in Gardenstown: clifftop self-catering, off-lead coastal walks, a harbour lunch, and a whisky distillery visit.",
    image: { src: "/7907_Gamrie_High_228.jpg", width: 8158, height: 5441 },
    content: [
      {
        type: "paragraph",
        text: "If you're looking for a corner of Scotland that genuinely suits dogs and their owners, Gardenstown on the Aberdeenshire Coast is hard to beat. This 3-day itinerary covers clifftop self-catering at Gamrie Chalets, off-lead coastal walks from the door, a harbour café lunch, a scenic North East 250 drive, and a visit to Strathisla Distillery. Your dog comes along for all of it.",
      },
      {
        type: "paragraph",
        text: "There's a particular kind of quiet that settles over you when you arrive at the Aberdeenshire Coast for the first time. The kind that makes you wonder why you left it so long. Pull up to Gardenstown on a Friday evening with your dog in the back seat and the North Sea turning gold in the fading light, and you'll understand immediately why people keep coming back.",
      },
      {
        type: "paragraph",
        text: "Gardenstown (or Gamrie, as locals know it) clings to a steep hillside above a small harbour on the Moray Firth. It's the kind of place that doesn't shout about itself. No gift shops, no queues, no car parks full of coaches. Just whitewashed cottages, salt air, and miles of raw coastline stretching in both directions. For dog owners, that last part matters more than anything else.",
      },
      {
        type: "paragraph",
        text: "This itinerary is built around a three-night, three-day stay at Gamrie Chalets, a small collection of clifftop self-catering chalets perched above the village. It's designed to make the most of what this corner of Aberdeenshire genuinely does well: big coastal walks, local food worth seeking out, distillery visits, and dramatic scenery along the North East 250. Your dog is welcome at every step.",
      },
      { type: "cta", label: "See the Dog-Friendly Chalets", href: "/properties/muckle-view" },
      { type: "heading", level: 2, text: "Why the Aberdeenshire Coast Suits Dog Owners So Well" },
      {
        type: "paragraph",
        text: "Most of Scotland is good for dogs. The Aberdeenshire Coast is exceptional. The Land Reform (Scotland) Act 2003 gives responsible dog owners the right to access most land and water, including coastal paths, clifftops, and open hillsides, provided dogs are kept under control around livestock and ground-nesting birds.",
      },
      {
        type: "paragraph",
        text: "What makes this stretch of coast so well-suited to dog owners is the combination of low visitor numbers and genuinely dramatic landscape. The cliffs between Gardenstown and Troup Head are among the highest on the Scottish mainland. The beach at Crovie sits below a row of fishermen's cottages so close to the sea that high tides splash the front walls. The headlands are windswept and empty for most of the year.",
      },
      {
        type: "paragraph",
        text: "At Gamrie Chalets, dogs are welcome, the walks start from outside your chalet door, and there's no need to worry about wet paws on hotel carpets. The logistics of a dog-friendly trip couldn't be simpler.",
      },
      { type: "cta", label: "Check Availability", href: "/properties/muckle-view" },
      { type: "heading", level: 2, text: "Your Dog-Friendly Weekend in Gardenstown: A 3-Day Itinerary" },
      { type: "heading", level: 3, text: "Friday Evening: Arrive and Settle Into Your Clifftop Chalet" },
      {
        type: "paragraph",
        text: "The drive into Gardenstown is part of the experience. The road drops sharply from the farmland above, switching back through the village in a series of tight bends before opening out onto the harbour front. Keep going uphill and you'll reach Gamrie Chalets, sitting on the clifftop with open views across the Moray Firth toward the Black Isle.",
      },
      {
        type: "paragraph",
        text: "Check in, let your dog explore the surrounding grass, and take a few minutes to watch the light change over the water. The chalets are fully equipped for self-catering, so a Friday evening arrival works well. Pick up supplies from Tesco in Banff or Macduff (both about 20 minutes away) before you head in, cook at your own pace, and get an early night.",
      },
      {
        type: "paragraph",
        text: "Saturday starts with a long walk, so the quieter the Friday the better.",
      },
      { type: "cta", label: "Book Your Clifftop Stay", href: "/properties/muckle-view" },
      { type: "heading", level: 3, text: "Saturday: Coastal Walks in Aberdeenshire, Straight From the Door" },
      {
        type: "paragraph",
        text: "Leave the chalet early, before the day gets away from you. The coastal path heading east from Gardenstown toward Troup Head Nature Reserve is one of the finest short walks on the entire North East 250 route and almost nobody does it.",
      },
      { type: "heading", level: 3, text: "Gardenstown to Troup Head Nature Reserve" },
      {
        type: "paragraph",
        text: "The path climbs steadily from the village, following the cliff edge above the sea. The views open up quickly. On a clear morning you can see across the Moray Firth to the hills of Sutherland. The cliffs drop away dramatically to your left, and the smell of wild thyme and sea campion mixes with the salt air.",
      },
      {
        type: "paragraph",
        text: "Troup Head Nature Reserve is home to the only mainland gannet colony in Scotland. Between May and August, thousands of gannets nest on the cliff faces below the headland. Watching them dive from 30 metres into the sea is one of those things that stops you mid-step. Keep dogs on a lead near the cliff edges and away from the nesting areas during breeding season, but the path itself is clear and well-suited to confident walkers.",
      },
      {
        type: "paragraph",
        text: "The return route follows the same path back to Gardenstown. Allow two to three hours at a relaxed pace with a dog. You'll be back in the village by mid-morning, ready for coffee.",
      },
      { type: "heading", level: 3, text: "Crovie: A Short Drive, an Unmissable Walk" },
      {
        type: "paragraph",
        text: "After coffee, drive the short distance west along the coast to Crovie (pronounced \"Crivvie\"). Park at the top of the hill and walk down to one of the most photographed villages in Scotland: a single row of cottages squeezed between a cliff face and the sea, with a pathway so narrow that residents move their belongings by wheelbarrow.",
      },
      {
        type: "paragraph",
        text: "The beach beyond the village is pebbly and usually deserted. Dogs can run freely here on most days outside of the summer peak. The scale of the cliffs from the shore is humbling in a way that photographs don't fully capture.",
      },
      { type: "heading", level: 3, text: "Findlater Castle: The Afternoon Detour" },
      {
        type: "paragraph",
        text: "If energy allows, the ruins of Findlater Castle sit on a sea stack near Cullen, about 30 minutes west of Gardenstown. The path to the viewpoint is short and spectacular. The castle appears suddenly at the cliff edge, almost impossibly positioned above the waves. Dogs handle the terrain well, though a lead is wise for the final approach.",
      },
      { type: "heading", level: 3, text: "Saturday Afternoon: A Dog-Friendly Harbour Lunch in Gardenstown" },
      {
        type: "paragraph",
        text: "By lunchtime, you and your dog will have earned something good. Head back to Gardenstown and make for Bumble & Brae, the family-run café tucked into the village.",
        links: [{ word: "Bumble & Brae", href: "https://bumbleandbrae.co.uk/" }],
      },
      {
        type: "paragraph",
        text: "Bumble & Brae describe themselves as \"a little seaside spot where good food and community come together,\" and reviewers back that up consistently. The homemade scones, Raspberry Bakewell, and afternoon tea all attract praise. One visitor noted they came with a border collie, sat outside around the back, and found staff who \"cannot do enough for you.\" Dogs are welcome in the outdoor seating area.",
      },
      {
        type: "paragraph",
        text: "The café opens Thursday to Sunday, so Saturday timing works perfectly. It's a small space and fills up, so booking ahead is a good idea via the Bumble & Brae website.",
      },
      {
        type: "paragraph",
        text: "The afternoon after lunch is yours. Walk the harbour, explore the steep lanes of the village, or drive five minutes to Crovie and watch the tide come in.",
      },
      { type: "heading", level: 3, text: "Sunday: Whisky, Castles, and the North East 250 Scenic Drive" },
      {
        type: "paragraph",
        text: "Sunday is for the road. The North East 250 is a 250-mile scenic driving route through Aberdeenshire and Speyside, and it passes directly through Gardenstown. Even a half-day loop from the chalets takes in beautiful scenery, a good slice of history, and at least one very good distillery.",
      },
      { type: "heading", level: 3, text: "Strathisla Distillery, Keith" },
      {
        type: "paragraph",
        text: "Drive inland to Keith, about 45 minutes south of Gardenstown, and visit Strathisla Distillery. Founded in 1786, it's Scotland's oldest continuously operating distillery and the spiritual home of Chivas Regal. The distillery sits beside a mill stream with twin pagoda roofs that look exactly as a Speyside distillery should look.",
        links: [
          { word: "Strathisla Distillery", href: "https://www.maltwhiskydistilleries.com/strathisla/direct" },
        ],
      },
      {
        type: "paragraph",
        text: "Guided tours cover the history and production process, and the on-site shop sells distillery-exclusive expressions including limited releases not available elsewhere. Dogs aren't permitted inside the buildings, but the grounds and car park are fine for a brief stop. One person can stay outside with the dog while the other takes the tour. It's worth calling ahead to check the current dog policy and tour availability before you visit.",
      },
      { type: "heading", level: 3, text: "Huntly Castle" },
      {
        type: "paragraph",
        text: "On the way back toward Gardenstown, the ruins of Huntly Castle make a worthwhile stop. The castle dates to the 12th century and stands above the River Deveron in the centre of Huntly. The grounds are open, dogs are welcome on leads, and the stonework is exceptional, particularly the heraldic inscriptions above the main entrance.",
      },
      {
        type: "paragraph",
        text: "Back at Gamrie Chalets by late afternoon, there's time for one last walk along the clifftop before the light goes. The Moray Firth from the chalet viewpoint at dusk, with a dram of something from Strathisla, is a fitting way to close a weekend.",
      },
      { type: "heading", level: 3, text: "The Pennan Inn: A Dinner Worth the Drive" },
      {
        type: "paragraph",
        text: "If you'd like to finish Sunday evening with a meal out, The Pennan Inn is 20 minutes east of Gardenstown along the coast road. The inn holds an AA Rosette and serves Scottish seafood landed daily from Peterhead, Fraserburgh, and Macduff. Pennan itself is the village made famous by the 1983 Bill Forsyth film Local Hero — and yes, the red phone box is still there.",
        links: [{ word: "The Pennan Inn", href: "https://thepennaninn.co.uk/" }],
      },
      {
        type: "paragraph",
        text: "The Pennan Inn is open Wednesday to Sunday from 5pm. Reservations are recommended, so check their website for current dog-friendly seating arrangements before you book.",
      },
      { type: "heading", level: 2, text: "Practical Tips for a Dog-Friendly Trip to the Aberdeenshire Coast" },
      {
        type: "list",
        items: [
          "Getting there: Gardenstown is approximately two hours north of Aberdeen by car. There's no direct public transport to the village, so a car is essential for this itinerary.",
          "Accommodation: Gamrie Chalets are self-catering and dog-friendly, with walks accessible directly from the property. Check availability and book early for summer weeks, which fill quickly.",
          "Supplies: Stock up in Banff or Macduff before arriving in Gardenstown. Both towns have supermarkets and petrol stations. Gardenstown itself has no shops.",
          "Tides and paths: Check tide times if you plan to walk on the beach at Crovie. Some sections of the coastal path near Troup Head are narrow and exposed, so keep dogs on leads near cliff edges.",
          "Seasonal considerations: The gannet colony at Troup Head is active from April to August. Dogs must be kept under control near ground-nesting birds during this period.",
          "Nearby dining: The Pennan Inn (Pennan, AB43 6JB) is the standout evening dining option near Gardenstown. Book ahead as they're small and fill up quickly, particularly at weekends.",
          "The Garden Arms, Gardenstown: the local pub in the village, serving food. Worth checking opening hours before you arrive as schedules can vary seasonally.",
          "Glenglassaugh Distillery: a great alternative (or addition) to the Strathisla visit — a coastal distillery near Portsoy, about 20 minutes west of Gardenstown, producing single malt since 1875. Check their website for tour times.",
        ],
      },
      { type: "heading", level: 2, text: "The Aberdeenshire Coast Stays With You" },
      {
        type: "paragraph",
        text: "The thing about a weekend in Gardenstown is that it doesn't try to impress you. The coast does the work. The clifftop does the work. The quietness of a village that still feels genuinely apart from everywhere else does the work. You arrive with a dog and a car full of food, you walk further and eat better than you expected, and you leave already thinking about when you can come back.",
      },
      {
        type: "paragraph",
        text: "Gamrie Chalets sits at the centre of all of it, close enough to the North East 250's best stops to fill days without effort, and far enough from the noise to feel like a proper escape.",
      },
      {
        type: "ctaGroup",
        items: [
          { label: "Check Availability", href: "/properties/muckle-view" },
          { label: "See the Dog-Friendly Chalets", href: "/properties/muckle-view" },
        ],
      },
    ],
  },
];
