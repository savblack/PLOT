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
  pageMeta: "Written by the one person who builds plot. October 2026.",
  lead: "You watched it. You had a feeling. Plot is where that goes. Log a movie or an episode in about ten seconds, say how it hit you in a sentence, and get told when the next one drops. No essays, no dark-mode gloom, no scrolling seven apps to find out what's on. It's a movie and TV journal made by one person, around a day job, for people who just love this stuff.",
  facts: [
    {
      term: "What it is",
      detail: "A movie and TV tracker, watchlist, release calendar and journal.",
    },
    {
      term: "Who it's for",
      detail: "Anyone who loves movies and TV. You don't need to call yourself a cinephile.",
    },
    {
      term: "What it costs",
      detail: "Free, forever. Premium is US$3/month or US$24/year with a 7-day free trial.",
    },
    {
      term: "Where it runs",
      detail: "In your browser at <a href=\"https://app.theplot.tv\" data-cta=\"about-facts\">app.theplot.tv</a>. iPhone and Android apps are on the way.",
    },
    {
      term: "Who makes it",
      detail: "One independent developer, around a full-time job. No investors, no ads.",
    },
  ],
  heroCtas: [
    {
      label: "Start your plot, free",
      href: "https://app.theplot.tv/signup",
    },
    {
      label: "See what Premium adds",
      href: "/pricing",
    },
  ],
  sections: [
    {
      id: "why",
      heading: "Why I built plot",
      paragraphs: [
        "You don't have to call yourself a cinephile to belong here. If you've ever rewatched the same show three times because nothing else felt right, you're the person I made this for.",
        "Plot started because of a real lack of enthusiasm for the apps that already exist. They're clunky, seemingly only ever in dark mode, and bluntly, no fun to look at. A place to track what you watch shouldn't be hard on the eyes or a chore to open.",
        "Then there was the pressure. The pressure of writing reviews, of performing how you felt about something in the \"right\" way. Plot is for people who love TV, who love movies, who love the cinema and aren't afraid to say exactly how something made them feel. If all you have to say about a movie is that it made you cry 14 separate times, firstly, shout out to my emotional baddies, and secondly, thanks for the heads up! That one's getting saved for when a good cry is needed.",
      ],
      pullQuote: "Sometimes the only review worth writing is \"I fucking loved that\", and then moving on.",
    },
    {
      id: "reviews",
      heading: "Reviews that take ten seconds",
      paragraphs: [
        "That's why Plot caps the characters in your reviews. The point is to capture your immediate, true reaction, the way you would in a journal. Nobody delivers a measured critique the second the credits roll. You have a feeling. That's what movies and TV are designed to give us. They're not made to be picked apart frame by frame.",
        "Rate it, say how it hit you, move on. Months later you'll scroll back through your Plot and remember exactly who you were when you watched it. <strong>That's the whole product: the joy of watching, minus the performance of it.</strong>",
      ],
    },
    {
      id: "features",
      heading: "What plot does",
      paragraphs: [
        "Building in this space, you notice the small frustrations you'd usually ignore. Never knowing when a show drops or the next episode lands. Forgetting the movie a friend swore by. The nightly hunt across seven platforms, only to give up and pick the first thing on Netflix. Plot remembers all of it, so you don't have to.",
      ],
      features: [
        {
          title: "Track everything you watch",
          detail: "Movies and TV in one timeline, with ratings and short notes that stay yours.",
        },
        {
          title: "A watchlist with a memory",
          detail: "Save the movie your friend swore by before you forget the title, and see where it's streaming when you finally get to it.",
        },
        {
          title: "Your own release calendar",
          detail: "Every new episode, season and film you care about, laid out so there's always something to look forward to.",
        },
        {
          title: "What's On, daily",
          detail: "What's new and trending across streaming platforms on one page, no logging in to seven apps. <a href=\"/whats-on\" data-cta=\"about-features\">Browse What's On</a>",
        },
        {
          title: "Where to watch",
          detail: "The service that has it, right on the title, so the hunt ends before it starts.",
        },
        {
          title: "Lists with a point of view",
          detail: "Comfort rewatches, \"movies to make my partner watch\", the lot. Up to 5 on Free, unlimited on Premium.",
        },
        {
          title: "Friends and taste match",
          detail: "Follow friends, share your profile, and see how alike your taste really is with one number. <a href=\"/taste-match\" data-cta=\"about-features\">Try Taste match</a>",
        },
      ],
    },
    {
      id: "premium",
      heading: "Free forever, and Premium when you want more",
      paragraphs: [
        "Everything above is free, with no credit card and no trial clock. I'm not holding the good bits hostage.",
        "Premium is for the nights you want Plot to do the deciding. Every subscription goes straight into keeping Plot independent and shipping the next thing. There are no ads to fall back on, and that's on purpose.",
      ],
      premiumCard: {
        eyebrow: "Premium",
        amount: "US$2",
        per: "/month",
        alt: "US$24 billed yearly, or US$3 monthly. Taxes included. 7-day free trial.",
        items: [
          "<strong>Pick for Me</strong> hands you a shortlist for tonight from your own watchlist.",
          "<strong>Live calendar subscription</strong> puts new episodes in your calendar app, next to your actual life.",
          "<strong>Unlimited lists</strong>, so the \"movies to make my partner watch\" list never has to end.",
        ],
        cta: "Try Premium free for 7 days",
        note: "Cancel in the trial and you pay nothing.",
      },
    },
    {
      id: "friends",
      heading: "Better with your people",
      paragraphs: [
        "Plot is quieter than a social network and better than a group chat. Follow a friend and you'll see what they're watching and what they thought, in their own words, not a 2,000-word essay. Compare your taste and settle the argument about whose recommendations are better. Share your calendar with family so they know not to call you during the Summer House reunion.",
        "The fastest way to get someone on Plot is to send them your <a href=\"/taste-match\" data-cta=\"about-friends\">taste match</a>. Nobody can resist finding out they're a 41.",
      ],
    },
    {
      id: "next",
      heading: "What's next",
      paragraphs: [
        "I've got a lot more I want to do. Native apps for iPhone and Android. Push and email alerts the moment something on your watchlist arrives. Smarter, more personal recommendations. And watch together, so you and your friends can line up the same show and watch in real time, wherever you are. Everything that has already shipped is on the <a href=\"/changelog\" data-cta=\"about-changelog\">changelog</a>, newest first.",
      ],
    },
    {
      id: "solo",
      heading: "Built by one person",
      paragraphs: [
        "Plot is built by one person, around a full-time job. There's no team, no investors and no corporate roadmap. It's shaped almost entirely by feedback from the people who use it, which means you. Any note, good or bad, any feature request or bug you spot, lands in my inbox and usually ends up in the app. You can send one anytime from Settings, or email <a href=\"mailto:contact@theplot.tv\" data-cta=\"about-email\">contact@theplot.tv</a>.",
        "Plot is still early, so if you're using it now, you're an early user too, bugs and all. When something breaks or feels off, tell me. <strong>I don't take that kind of patience lightly, and it's already more than enough.</strong>",
        "If you ever want to do more than that, going Premium is the biggest help. Plot is also on <a href=\"https://ko-fi.com/J7P123TYGK\" target=\"_blank\" rel=\"noopener\" data-cta=\"about-kofi\">Ko-fi</a> for anyone who'd rather just buy the builder a coffee. Both cover what it actually costs to run, and both buy me more time to keep building.",
        "Thank you for reading this. Thank you for considering Plot. And if you're already a user, thank you for backing a solo builder trying to make a life out of building beautiful things.",
      ],
    },
    {
      id: "faq",
      heading: "Questions people ask",
      paragraphs: [
      ],
      faq: [
        {
          q: "Is Plot free?",
          a: "Yes. Tracking, your watchlist, the release calendar, What's On, where to watch, up to 5 lists and following friends are all free, forever, with no credit card. Premium adds unlimited lists, a live calendar subscription and Pick for Me for US$3/month or US$24/year, with a 7-day free trial.",
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
    intro: "Plot is built on data from these sources.",
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
