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
  headline: 'Every release date, in your calendar.',
  body: 'Save what you’re waiting for and Plot tells you when it’s out, in theaters or streaming.',
  cardTitle: 'Coming up',
  cardSub: 'From your watchlist',
  saved: 'On your list',
  save: '+ Save',
  inTheatersNow: 'In theaters now',
  inTheatersOn: 'In theaters {date}',
  cta: 'Start tracking',
  note: 'Free in-app calendar. Premium integrates with your calendar app.',
};

// Bring your history: the import sources the app supports today.
export const IMPORT = {
  headline: 'Bring your whole history with you.',
  body: 'Coming from Letterboxd, Trakt, TV Time or IMDb? Import your ratings, reviews, watchlist and watch history. It’s free on every plan.',
  cardTitle: 'Your watch history',
  cardSub: 'All of it, in one place',
  // Sample result on the card (illustrative).
  resultTitle: '1,284 titles are on your Plot',
  resultSub: '412 ratings · 96 reviews · 58 on your watchlist',
  cta: 'Import my history',
  note: 'Free forever. No credit card required.',
};

export const LISTS = {
  headline: 'Lists only you could make.',
  body: 'By decade, director, mood or the person you watch with. Share them, or keep them just for you.',
  // Each name matches the TMDB set that fills its cover (data-src in index.html).
  cards: [
    { name: 'Date night', count: '14 titles', visibility: 'Private', source: 'Top-rated romance' },
    { name: 'This week’s must-sees', count: '23 titles', visibility: 'Public', source: 'Trending this week' },
    { name: 'Horror night', count: '9 titles', visibility: 'Shared', source: 'Top-rated horror' },
  ],
  cta: 'Start a list',
  note: 'Five lists free. Unlimited with Premium.',
};

// Premium: headline and trial on one line, three feature tiles, one line for the
// rest. The markup is in index.html; /pricing keeps the longer stories (copy/plans.js).
export const PREMIUM = {
  headline: 'Less deciding. More watching.',
  tiles: [
    { title: 'Something to watch, in under a minute.', body: 'Tell Plot how long you’ve got and what you’re in the mood for.' },
    { title: 'Find out your compatibility based on cinema.', body: 'The films you agree on, and the ones that are still a sore point.' },
    { title: 'Every story has a plot. Here’s yours.', body: 'The genres you lean on, the hours you’ve put in, the titles you keep going back to.' },
  ],
  cta: 'Start 7-day free trial',
  price: '$2/mo billed yearly, 4 months free.',
  alsoLabel: 'Also in Premium',
  also: 'watch together, themes and widgets, unlimited lists including smart lists, calendar dates, actor and director alerts.',
  more: 'See everything',
};

// Plot mobile, coming soon: the app's home screen in a phone, and the launch
// waitlist (posts with list: 'mobile-app').
export const APP = {
  pill: 'Coming soon',
  headline: 'plot, in your pocket.',
  body: 'Everything you love about Plot: discover, track, curate and share. Be the first to know when the app launches.',
  notifyCta: 'Notify me',
  notifySuccess: "You're on the list — we'll email you the moment the app lands.",
};

// Replaces "Built by a solo developer" and its Ko-fi button.
export const INDIE = {
  headline: 'Made by an independent developer, not a studio or streaming platform.',
  body: 'Plot answers to the people who use it, not advertisers or investors. Premium keeps it that way.',
  pills: ['No ads', 'Independent', 'Free plan, forever'],
  cta: 'Support Plot with Premium', // same checkout intent as the Premium card
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
