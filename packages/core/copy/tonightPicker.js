// Tonight's picker (Premium): movies and TV. Wording follows plansPage.js's
// `picker` story: your time + your services → a few options, or a random
// pick. No claims about playback or tailored recommendations.
export const TONIGHT_PICKER = {
  title: 'Tonight’s picker',
  intro: 'Movie or show? Set the mood, press Go, and plot narrows it down to three.',

  mediaTypeLabel: 'What are you after',
  mediaTypes: { movie: 'A movie', tv: 'A TV show' },

  timeLabel: 'Time to spare',
  runtime: (minutes) => (minutes ? `Up to ${minutes} min` : 'Any length'),
  tvFormatLabel: 'How much of a commitment',
  tvFormats: {
    any: 'Anything',
    miniseries: 'Mini-series',
    oneSeason: 'One season',
    multiSeason: 'A few seasons',
  },
  episodeLabel: 'Episode length',
  genresLabel: 'In the mood for',
  genresHint: 'Pick any. Leave empty for everything.',
  eraLabel: 'Released',
  eras: {
    any: 'Any time',
    recent: 'Last few years',
    '2010s': '2010s',
    '2000s': '2000s',
    '1990s': '1990s',
    classic: 'Before 1990',
  },
  scoreLabel: 'TMDB score',
  score: (min) => (min ? `${min}+` : 'Any'),
  languageLabel: 'Original language',
  languages: {
    any: 'Any',
    en: 'English',
    fr: 'French',
    es: 'Spanish',
    ko: 'Korean',
    ja: 'Japanese',
    hi: 'Hindi',
    it: 'Italian',
    de: 'German',
  },

  limitLabel: 'Narrow it down',
  onlyServices: 'Only on my streaming services',
  onlyServicesMissing: 'Add your services in Settings to use this',
  onlyWatchlist: 'Only from my watchlist',
  onlyWatchlistMissing: (type) => (type === 'tv'
    ? 'Save a show to your watchlist to use this'
    : 'Save a movie to your watchlist to use this'),
  hideKids: 'Hide kids and family titles',

  go: 'Go',
  randomSelect: 'Random select',

  spinning: [
    'Shuffling the reels',
    'Checking the couch cushions',
    'Asking the popcorn',
    'Dimming the lights',
  ],

  resultsTitle: (n) => (n >= 3 ? 'Three for tonight' : n === 2 ? 'Two for tonight' : 'One for tonight'),
  fewerThanThree: (n) => (n === 1
    ? 'Only one fits those options. Loosen a filter for more.'
    : 'Only two fit those options. Loosen a filter for more.'),
  randomTitle: 'Your random pick',
  spinAgain: 'Spin again',
  changeOptions: 'Change options',
  onYourWatchlist: 'On your watchlist',
  minutes: (n) => `${n} min`,
  episodeMinutes: (n) => `${n} min episodes`,
  seasons: (n) => (n === 1 ? '1 season' : `${n} seasons`),
  miniseries: 'Mini-series',
  score10: (n) => `${n.toFixed(1)} on TMDB`,

  emptyTitle: 'Nothing fits those options',
  emptyBody: 'Try more time, fewer filters, or untick one of the boxes.',
  loadError: 'Could not reach TMDB. Try again in a moment.',

  gateTitle: 'Tonight’s picker is part of plot Premium',
  gateBody: 'Choose a movie or a show, how much time you have and the services you use. Get three options for tonight, or let a random pick make the decision.',
};
