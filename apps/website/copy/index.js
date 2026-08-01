// Reference-only copy catalog for apps/website/index.html (the homepage —
// the largest and most section-heavy page on the site). Not imported by the
// HTML — see copy/common.js for how this catalog is used.
//
// Split into one const per on-page section, in source order, since the page
// is long and sections don't share much vocabulary.

export const META = {
  title: 'PLOT – Your Film & TV Companion',
  description: "PLOT is your personal film and TV companion: for everything you've watched and everything you want to watch, all in one beautiful home.",
  ogImageAlt: 'PLOT — your film & TV companion',
};

export const HERO = {
  headline: 'Your film & TV companion',
  sub: "Everything you've watched. Everything you want to watch.",
  cta: 'Start your PLOT →',
};

// A scroll-driven series of short lines building to the "PLOT does." payoff.
export const MANIFESTO = {
  lines: [
    "You don't just watch things.",
    'You think about them.',
    'You talk about them.',
    'You carry them with you.',
    'But no app has ever cared\nas much as you do.',
  ],
  payoff: 'does.', // rendered after the PLOT wordmark, e.g. "PLOT does."
};

export const GUIDE_DEMO = {
  headline: 'Everything.',
  headlineEm: 'In one place.',
  body: "Always know what's worth watching. PLOT tracks what's trending worldwide, pulls the top 10 across the major platforms and every release on the way into a single feed. Your feed.",
  cta: 'Unify your entertainment universe →',
  // Floating UI chips shown around the phone mockup
  chips: {
    trending: { sub: 'Trending today', title: 'Hot right now' },
    top10: { sub: 'This week', title: 'Top 10' },
    popularTv: { sub: 'Popular TV', title: 'Most binged shows' },
  },
  heroBadge: 'TRENDING #1',
};

export const TIMELINE = {
  headline: 'A timeline as rich as your taste',
  intro: 'Your watch history tells a story and every story needs a PLOT.',
  // Illustrative watch-history entries shown scrolling across the timeline.
  // Titles are real; the notes are invented flavor-text reactions.
  entries: [
    { year: '2023', date: 'Oct 2023', title: 'Oppenheimer', note: 'Three hours. Felt like one.' },
    { year: '2023', date: 'Nov 2023', title: 'The Bear', note: 'Stressful. Perfect. Both.' },
    { year: '2023', date: 'Dec 2023', title: 'Saltburn', note: 'Unhinged in all the right ways.' },
    { year: '2024', date: 'Feb 2024', title: 'Past Lives', note: 'Quietly devastating.' },
    { year: '2024', date: 'Jun 2024', title: 'Presumed Innocent', note: 'Did not trust a single character. I was right.' },
    { year: '2024', date: 'Sep 2024', title: 'The Substance', note: 'Nothing prepares you.' },
    { year: '2024', date: 'Dec 2024', title: 'Babygirl', note: 'Nicole Kidman.' },
    { year: '2025', date: 'Jan 2025', title: 'Severance S2', note: 'Worth the wait.' },
    { year: '2025', date: 'Mar 2025', title: 'Adolescence', note: 'Four episodes. Changed everything.' },
    { year: '2025', date: 'Apr 2025', title: 'Sinners', note: 'Ryan Coogler does it again.' },
    { year: '2025', date: 'May 2025', title: 'Top Gun: Maverick', note: 'Still the best sequel ever made.' },
    { year: '2026', date: 'Jan 2026', title: 'A Knight of the Seven Kingdoms', note: 'Back in Westeros.' },
    { year: '2026', date: 'Mar 2026', title: 'Project Hail Mary', note: 'Gosling in space.' },
    { year: '2026', date: 'May 2026', title: 'The Devil Wears Prada 2', note: "That's all." },
    { year: '2026', date: 'Jul 2026', title: 'The Odyssey', note: 'Nolan does Homer.' },
  ],
};

export const CALENDAR_DEMO = {
  headline: 'Never miss ',
  headlineEm: 'a drop.',
  sub: "Save that new show, movie or cinema release. Whatever you're excited for, let your calendar do the remembering.",
  guide: {
    title: 'Upcoming',
    hintTouch: 'Tap + to save', // default hint
    hintPointer: 'Click + to save', // swapped in when a mouse/trackpad is detected
    emptyState: 'Add releases from the guide to see them here',
    emptyStateAlt: 'Add releases from the guide — they appear here', // used by the day-panel empty state
    addToCalendar: 'Add to calendar',
    remove: 'Remove',
  },
  eventTypes: {
    cinema: 'Cinema',
    streaming: 'Streaming',
    episode: 'Episode',
  },
  toasts: {
    removed: 'Removed from calendar',
    added: (monthDay) => `✓ Added to ${monthDay}`, // e.g. "✓ Added to March 6"
  },
  dayPanelNoSaved: (monthDay) => `${monthDay} — no saved releases`,
  // Illustrative fallback releases shown before/if the live TMDB fetch fails
  fallbackReleases: ['F1: The Movie', 'Sinners', 'Project Hail Mary', 'Nosferatu', 'The Substance'],
};

export const LISTS_DEMO = {
  headline: 'The lists only ',
  headlineEm: 'you',
  headlineEnd: ' could curate.',
  body: "Organise by decade, director, or whatever mood you're in. Create and share film and TV collections that are unmistakably yours.",
  cta: 'Start curating →',
  // Sample list categories cycled through in the coverflow demo
  sampleLists: [
    { name: 'Award winners', count: '20 films' },
    { name: 'Date night', count: '12 films' },
    { name: 'Spooky season', count: '13 films' },
  ],
};

export const APP_SOON = {
  eyebrow: 'Coming soon',
  headline: 'PLOT, in',
  headlineEm: 'your pocket.',
  body: 'Everything you love about PLOT: discover, track, curate and share. Landing on iPhone and Android. Be the first to know when it drops.',
  notifyCta: 'Notify me',
  badge: 'Coming soon',
  // Static labels inside the phone mockup screenshot
  mockup: {
    tabs: ['Discover', 'Releases', 'Guide'],
    nav: ['Home', 'Calendar', 'My Lists', 'History'],
    heroBadge: 'TRENDING #1',
    sections: [
      { sub: 'Trending today', title: 'Hot right now' },
      { sub: 'Popular TV', title: 'Most binged shows' },
    ],
  },
};

// Live ticker along the bottom of the page — category labels only, titles are
// pulled live from TMDB (or this hardcoded fallback list if that call fails).
export const TICKER = {
  badge: 'Live',
  categories: {
    trendingNow: 'Trending Now',
    inCinemas: 'In Cinemas',
    comingSoon: 'Coming Soon',
    topRatedTv: 'Top Rated TV',
  },
  fallbackTitles: {
    trendingNow: ['Sinners', 'Thunderbolts', 'Novocaine', 'A Working Man', 'The Amateur', 'Black Bag'],
    comingSoon: ['Mission: Impossible – The Final Reckoning', 'Lilo & Stitch', 'Jurassic World Rebirth'],
    topRatedTv: ['Adolescence', 'Severance', 'The White Lotus', 'Landman', 'Paradise'],
  },
};

export const WHATS_ON_CTA = {
  headline: "What's on, ",
  headlineEm: 'daily.',
  sub: 'Your daily briefing on everything worth watching.',
  browseLink: "Browse What's On →",
  newsletterCta: 'Subscribe',
  newsletterHint: 'Or get it in your inbox, weekly.',
  newsletterSuccess: "You're in — first digest this Sunday.",
  appNotifySuccess: "You're on the list — we'll email you the moment the app lands.",
};
