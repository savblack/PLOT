// Reference-only copy catalog for apps/website/about.html. Not imported by
// the HTML — see copy/common.js for how this catalog is used. Rebuilt from the
// page markup; links are kept as inline HTML the way the page renders them.
//
// Casing: "Plot" in running text (DM Sans); lowercase "plot" only where the
// page sets it in Gabarito (h1/h2, page meta, buttons, the closer), where it
// reads as the wordmark. The FAQ answers must match the FAQPage JSON-LD in the
// page head word for word.

export const ABOUT_PAGE = {
  meta: {
    title: "About Plot: the free movie & TV journal built by one person",
    description: "Plot is a free movie and TV tracker and journal built by a solo developer. Track what you watch, never miss a release, and pick what to watch tonight. Premium from US$2/month.",
  },
  pageLabel: "About",
  h1: "About plot",
  pageMeta: "A letter from the founder.",
  lead: "For years my watchlist was a note on my phone, my reviews were texts to friends, and release dates were whatever I happened to remember. This worked, if you count forgetting half of it as working. So I built Plot. The note became a watchlist that knows when and where everything is streaming. The texts became reviews, character-capped by design. The remembering is now outsourced to a calendar, that never forgets when the next episode drops.",
  sections: [
    {
      id: "why",
      heading: "Why I built plot",
      paragraphs: [
        "You don't have to call yourself a cinephile to belong here. If you've ever rewatched the same show three times because nothing else felt right, you're the person I made this for.",
        "The apps that already exist are clunky, seemingly only ever in dark mode, and no fun to look at. Worse, they come with pressure: write the review, perform how you felt in the \"right\" way. If all you have to say about a movie is that it made you cry 14 separate times, firstly, shout out to my emotional baddies, and secondly, thanks for the heads up. That one's getting saved for when a good cry is needed.",
        "That's why Plot caps the characters in your reviews. Nobody delivers a measured critique the second the credits roll. You have a feeling, and that's what movies and TV are for. Rate it, say how it hit you, move on. Months later you'll scroll back and remember exactly who you were when you watched it. <strong>That's the whole product: the joy of watching, minus the performance of it.</strong>",
      ],
      pullQuote: "Sometimes the only review worth writing is \"I fucking loved that\", and then moving on.",
    },
    {
      id: "features",
      heading: "What plot does",
      features: [
        {
          title: "Track everything you watch",
          detail: "Movies and TV in one timeline, with ratings and notes that stay yours.",
        },
        {
          title: "A watchlist with a memory",
          detail: "Save what a friend swore by. Plot shows where it's streaming when you finally get to it.",
        },
        {
          title: "A release calendar",
          detail: "Every episode, season and film you care about, in one place.",
        },
        {
          title: "What's On, daily",
          detail: "What's new and trending on every service, on one page. <a href=\"/whats-on\" data-cta=\"about-features\">Browse What's On</a>",
        },
        {
          title: "Friends and taste match",
          detail: "Follow friends, read what they thought in their own words, and compare taste with one number. Nobody can resist finding out they're a 41. <a href=\"/taste-match\" data-cta=\"about-features\">Try Taste match</a>",
        },
      ],
      premiumNote: "Free, with no credit card. Moving from Letterboxd, Trakt, Netflix or TMDB? Bring your history with you, and confirm every entry before it's saved. Premium is US$3 a month or US$24 a year, with the first 7 days free, and adds Pick for Me, a live calendar subscription and unlimited lists. <a href=\"/pricing\" data-cta=\"about-premium\">See what Premium adds</a>",
    },
    {
      id: "solo",
      heading: "Built by one person",
      paragraphs: [
        "Plot is built by one person, around a full-time job. There's no team, no investors, no ads and no corporate roadmap, so the only thing that keeps Plot running is people choosing Premium. That's deliberate: nobody can tell me to sell your data or bury the app in ads, because there's nobody to answer to but the people who use it. It's shaped almost entirely by feedback from the people who use it, which means you. Any note, good or bad, any feature request or bug you spot, lands in my inbox and usually ends up in the app. Send one from Settings, or email <a href=\"mailto:contact@theplot.tv\" data-cta=\"about-email\">contact@theplot.tv</a>.",
        "Plot is still early, so if you're using it now, you're an early user too, bugs and all. <strong>I don't take that kind of patience lightly, and it's already more than enough.</strong> If you ever want to do more, Plot is on <a href=\"https://ko-fi.com/J7P123TYGK\" target=\"_blank\" rel=\"noopener\" data-cta=\"about-kofi\">Ko-fi</a>. Thank you for reading this, and for considering Plot.",
      ],
    },
    {
      id: "glance",
      heading: "plot, at a glance",
      facts: [
        {
          term: "What it is",
          detail: "Your whole watching life in one place. A journal for how it felt, a watchlist with a memory, a calendar for what's coming, a guide to what's on, and a way to share it with the people you watch with.",
        },
        {
          term: "Who it's for",
          detail: "People who love movies and TV and don't need a word for it.",
        },
        {
          term: "What it costs",
          detail: "Nothing. Premium is US$3/month or US$24/year, with the first 7 days free.",
        },
        {
          term: "Where it runs",
          detail: "Any browser, at <a href=\"https://app.theplot.tv\" data-cta=\"about-facts\">app.theplot.tv</a>. iPhone and Android are coming.",
        },
      ],
      ctas: [
        {
          label: "Start your plot, free",
          href: "https://app.theplot.tv/signup",
        },
        {
          label: "See what Premium adds",
          href: "/pricing",
        },
      ],
    },
    {
      id: "faq",
      heading: "Questions people ask",
      faq: [
        {
          q: "Is Plot free?",
          a: "Yes. Tracking, your watchlist, the release calendar, What's On, up to 5 lists and following friends are free, with no credit card. Premium adds unlimited lists, a live calendar subscription and Pick for Me for US$3/month or US$24/year, with a 7-day free trial.",
        },
        {
          q: "How is Plot different from Letterboxd, Trakt or IMDb?",
          a: "Plot covers movies and TV together, in one journal, in daylight. Reviews are short on purpose, so you log a feeling instead of writing an essay. And Plot leans into what happens next: a release calendar, where to watch on every title, and a daily What's On page.",
        },
        {
          q: "Is there a Plot app for iPhone or Android?",
          a: "Not yet. Plot runs in any browser at app.theplot.tv and works well on a phone. Native iPhone and Android apps are in progress, and you can ask to be notified on the <a href=\"/#app-soon\" data-cta=\"about-faq\">home page</a>.",
        },
        {
          q: "Can I import my history from another app?",
          a: "Yes. Import your watch history from Letterboxd, Trakt, Netflix or TMDB exports in Settings. You confirm every entry before it's saved, your existing Plot ratings and notes stay untouched, and duplicates are skipped.",
        },
        {
          q: "Who owns my data?",
          a: "You do. New profiles start private, so only followers you approve see your activity, and private notes are only ever visible to you. Plot doesn't sell your data and runs no ads. You can export everything, and the full detail is in the <a href=\"/privacy\" data-cta=\"about-faq\">privacy policy</a>.",
        },
      ],
    },
  ],
  closer: {
    headline: "Your movies. Your shows.<br>Your plot.",
    ctas: [
      {
        label: "Start your plot, free",
        href: "https://app.theplot.tv/signup",
      },
      {
        label: "Log in",
        href: "https://app.theplot.tv/login",
      },
    ],
  },
  credits: {
    title: "Credits",
    items: [
      {
        name: "TMDB",
        notice: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
      },
      {
        name: "TVmaze",
        notice: "Episode air dates and the TV guide use the TVmaze API.",
      },
      {
        name: "OMDb",
        notice: "Critic scores are retrieved through the OMDb API.",
      },
    ],
  },
};
