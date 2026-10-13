// Reference-only copy catalog for apps/website/index.html (the homepage —
// the largest and most section-heavy page on the site). Not imported by the
// HTML — see copy/common.js for how this catalog is used.
//
// Split into one const per on-page section, in source order, since the page
// is long and sections don't share much vocabulary.

export const META = {
  title: 'plot | Movie & TV Tracker',
  description: "plot is your personal movie and TV companion: for everything you've watched and everything you want to watch, all in one beautiful home.",
  ogImageAlt: 'plot — your movie & TV companion',
};

export const HERO = {
  eyebrow: 'Your movie and TV tracker',
  headline: 'Always know what to watch.',
  sub: 'All the movies and shows you’ve seen, saved and are counting down to. Finally in one place. That’s Plot.',
  cta: 'Start tracking',
  note: 'Free forever. No credit card required.',
  // "Up next": a fan of three posters with a notification over them. Titles
  // and dates come from /api/discover at runtime; these are the patterns.
  upNext: {
    // The status comes from the title's own data: "In theaters now" or
    // "New in theaters" (released in the last 14 days) for films,
    // "Trending this week" or "New series" (premiered in the last 30 days) for shows.
    label: 'Up next · {status}',
    notificationTitle: '{title} is in theaters now',
    notificationText: "It's on your watchlist, so we let you know.",
  },
};

// The one-screen section after the hero: headline, sub, CTA, and the sample
// diary cards beside it. "remember" is the pink word in the headline.
export const MEMORIES = {
  headline: 'Review, rate, remember.',
  sub: 'Reviews for the thoughts worth sharing. Private notes just for you.',
  subStrong: 'Plot keeps both safe, and always yours.',
  cta: 'Start your Plot',
  note: 'Free forever. No credit card required.',
  privateNoteLabel: 'Private note',
  // Sample diary content on the cards (illustrative, not a real user's).
  // Three diary states: rating only, rating + review, and review + private note.
  // The private note cycles through privateNotes on the site.
  cards: [
    { title: 'Severance', date: 'Apr 2', rating: 5 },
    { title: 'Perfect Days', date: 'Sep 14', rating: 5, review: 'Still thinking about it.' },
    { title: 'The Bear', date: 'Jul 3', rating: 3, review: 'Too stressful for me.' },
  ],
  privateNotes: [
    'Reminder to notice the light more.',
    'Bf’s favorite. Now mine too.',
    'Mom cried. Then I did.',
    'Watched alone. Didn’t feel alone.',
  ],
};

// Never miss a drop: the "Coming up" card fills from /api/discover movie/upcoming.
export const DROPS = {
  eyebrow: 'Never miss a drop',
  headline: 'Every release date, in one calendar.',
  body: 'Save anything you’re waiting for, whatever service it’s on. Plot keeps the dates and lets you know when it’s out.',
  cardTitle: 'Coming up',
  cardSub: 'From your watchlist',
  saved: 'On your list',
  save: '+ Save',
  inTheatersNow: 'In theaters now',
  inTheatersOn: 'In theaters {date}',
  sync: 'Synced live to your calendar app',
  premiumPill: 'Premium',
  cta: 'Start tracking',
  note: 'Free forever. Premium syncs it to your calendar app.',
};

// Bring your history: the import sources the app supports today.
export const IMPORT = {
  eyebrow: 'Switching is easy',
  headline: 'Bring your whole history with you.',
  body: 'Coming from Letterboxd, Trakt, TV Time or IMDb? Import your ratings, reviews, watchlist and watch history. It’s free on every plan.',
  cardTitle: 'Import your history',
  sources: [
    { name: 'Letterboxd', what: 'Ratings, reviews, watchlist and diary' },
    { name: 'Trakt', what: 'History, ratings and watchlist' },
    { name: 'TV Time', what: 'Shows and episode progress' },
    { name: 'IMDb', what: 'Ratings and watchlist' },
  ],
  imported: 'Imported',
  // Sample result on the card (illustrative).
  resultTitle: '1,284 titles are on your Plot',
  resultSub: '412 ratings · 96 reviews · 58 on your watchlist',
  cta: 'Import my history',
  note: 'Free forever. No credit card required.',
};

export const LISTS = {
  eyebrow: 'Lists',
  headline: 'Lists only you could make.',
  body: 'By decade, director, mood or the person you watch with. Share them, or keep them just for you.',
  cards: [
    { name: 'Comfort watches', count: '12 titles', visibility: 'Private' },
    { name: 'Best of the year', count: '31 titles', visibility: 'Public' },
    { name: 'Watch with Dad', count: '8 titles', visibility: 'Shared' },
  ],
  cta: 'Start a list',
  note: 'Five lists free. Unlimited with Premium.',
};

// Premium: only what /pricing promises. Prices and the checkout link mirror
// pricing.html (and copy/plans.js); change them together.
export const PREMIUM = {
  eyebrow: 'Plot Premium',
  headline: 'Less deciding. More watching.',
  intro: 'Everything in Free, plus:',
  features: [
    { title: 'Pick for Me', body: 'Say how long you’ve got and what you’re in the mood for. Get a shortlist for tonight, on the services you use.' },
    { title: 'Your release calendar, live', body: 'Every date you’re waiting on, kept up to date in your own calendar app.' },
    { title: 'Unlimited lists', body: 'Make as many as you like. Free has five.' },
  ],
  free: 'Your everyday watching stays free.',
  monthly: 'Monthly',
  annual: 'Annual',
  annualBadge: '· 4 months free',
  billedYearly: 'US$24 billed yearly · taxes included',
  billedMonthly: 'US$3 billed monthly · taxes included',
  cta: 'Start 7-day free trial',
  trial: 'You won’t be charged until day 7. Cancel during the trial and you pay $0.',
  compare: 'Compare Free and Premium',
};

// Replaces "Built by a solo developer" and its Ko-fi button.
export const INDIE = {
  eyebrow: 'Who makes Plot',
  headline: 'Made by an independent developer, not a studio or streaming platform.',
  body: 'Plot is paid for by the people who use it, not advertisers. That keeps it answering to you. Going Premium is the best way to support it.',
  pills: ['No ads', 'No investors', 'Free plan, forever'],
  cta: 'Start tracking free',
  story: 'Read the story',
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

// Closing section over the poster wall: account signup first, the newsletter
// as the quiet fallback.
export const CLOSER = {
  headline: 'Your next favorite ',
  headlineEm: 'is out there.',
  sub: 'Start free. Upgrade whenever you like.',
  cta: 'Start tracking',
  pricing: 'See pricing',
  newsletterHint: 'Not ready? Get What’s On, daily, by email.',
  newsletterCta: 'Subscribe',
  newsletterSuccess: "You're in. We'll email you the next issue.",
};
