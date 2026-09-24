// Tonight's movie picker (Premium). Wording follows plansPage.js's `picker`
// story: your time + your services → a few options, or a random pick. No
// claims about playback or tailored recommendations.
export const TONIGHT_PICKER = {
  title: 'Tonight’s movie picker',
  intro: 'Set the mood, press Go, and plot narrows it down to three.',

  timeLabel: 'Time to spare',
  runtime: (minutes) => (minutes ? `Up to ${minutes} min` : 'Any length'),
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

  limitLabel: 'Only show',
  onlyServices: 'Movies on my streaming services',
  onlyServicesMissing: 'Add your services in Settings to use this',
  onlyWatchlist: 'Movies on my watchlist',
  onlyWatchlistMissing: 'Save a movie to your watchlist to use this',

  go: 'Go',
  randomSelect: 'Random select',

  spinning: [
    'Shuffling the reels',
    'Checking the couch cushions',
    'Asking the popcorn',
    'Dimming the lights',
  ],

  resultsTitle: 'Three for tonight',
  randomTitle: 'Your random pick',
  spinAgain: 'Spin again',
  changeOptions: 'Change options',
  onYourWatchlist: 'On your watchlist',
  minutes: (n) => `${n} min`,
  score10: (n) => `${n.toFixed(1)} on TMDB`,

  emptyTitle: 'Nothing fits those options',
  emptyBody: 'Try more time, fewer filters, or untick one of the boxes.',
  loadError: 'Could not reach TMDB. Try again in a moment.',

  gateTitle: 'Tonight’s movie picker is part of plot Premium',
  gateBody: 'Choose how much time you have and the services you use. Get three options for tonight, or let a random pick make the decision.',
};
