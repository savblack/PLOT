// Pick for Me (Premium): the tonight picker, movies and TV. Four questions,
// a filters panel, and a sentence that fills in as the viewer answers. No
// claims about playback or tailored recommendations: results are "the plot
// lines you asked for", i.e. the viewer's own answers.
export const TONIGHT_PICKER = {
  // Title comes from the nav label (Pick for Me); this is the page subline.
  subtitle: 'Less deciding. More watching.',
  progress: (step, total) => `Question ${step} of ${total}`,

  steps: {
    type: {
      title: 'What are you watching tonight?',
      shortTitle: 'Movie or show',
    },
    length: {
      movieTitle: 'How long have you got?',
      tvTitle: 'How much of a commitment?',
      shortTitle: 'How long',
    },
    kind: {
      title: 'What kind of story?',
      subline: 'Pick as many as you like, or skip this one.',
      shortTitle: 'What kind',
    },
    quality: {
      title: 'How new, how good?',
      subline: 'Both are optional. Leave them on Any for the widest pick.',
      shortTitle: 'How new, how good',
    },
  },

  mediaTypes: {
    movie: { label: 'A movie', hint: 'One sitting, done tonight' },
    tv: { label: 'A show', hint: 'Something to start tonight' },
  },
  runtimes: (minutes) => ({ 90: 'Under 90 min', 120: 'Under 2 hours', 150: 'Under 2½ hours' }[minutes] ?? 'Any length'),
  tvFormatLabel: 'Format',
  tvFormats: {
    any: 'Anything',
    miniseries: 'Mini-series',
    oneSeason: 'One season',
    multiSeason: 'A few seasons',
  },
  episodeLabel: 'Episode length',
  episodeRuntime: (minutes) => (minutes ? `Up to ${minutes} min` : 'Any length'),
  showAllGenres: (n) => `Show all ${n} genres`,
  showFewerGenres: 'Show fewer genres',
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
  scoreHint: 'Out of 10. Higher scores mean fewer, better-known picks.',

  back: 'Back',
  next: 'Next',
  anyAnswer: 'Any',

  filtersTitle: 'Filters',
  filtersNone: 'None',
  onlyServices: 'Only on my services',
  onlyServicesMissing: 'Add your services in Settings to use this',
  onlyWatchlist: 'Only from my watchlist',
  onlyWatchlistMissing: (type) => (type === 'tv'
    ? 'Save a show to your watchlist to use this'
    : 'Save a movie to your watchlist to use this'),
  hideKids: 'Hide kids and family',
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
  summary: {
    services: 'My services',
    watchlist: 'My watchlist',
    noKids: 'No kids or family',
  },

  // The sentence. Filled parts come from answers; placeholders are shown
  // greyed out until answered.
  sentence: {
    start: 'Find me',
    type: { movie: 'a movie', tv: 'a show' },
    tvFormat: {
      miniseries: 'a mini-series',
      oneSeason: 'a one-season show',
      multiSeason: 'a show with a few seasons',
    },
    runtime: (minutes) => ({ 90: 'under 90 min', 120: 'under 2 hours', 150: 'under 2½ hours' }[minutes]),
    anyLength: 'any length',
    episodes: (minutes) => `with episodes under ${minutes} min`,
    anyKind: 'any kind',
    or: 'or',
    era: {
      recent: 'from the last few years',
      '2010s': 'from the 2010s',
      '2000s': 'from the 2000s',
      '1990s': 'from the 1990s',
      classic: 'from before 1990',
    },
    rated: (min) => `rated ${min}+`,
    inLanguage: (name) => `in ${name}`,
    onServices: 'on my services',
    fromWatchlist: 'from my watchlist',
  },

  yourRequest: 'Your request',
  questionsTitle: 'Questions',
  surpriseMe: 'Surprise me',
  // Desktop side card: Pick sits under the last question, so the card offers "Or [Surprise me]".
  orSurprise: 'Or',
  go: 'Pick',

  spinning: [
    'Shuffling the reels',
    'Checking the couch cushions',
    'Asking the popcorn',
    'Dimming the lights',
  ],

  // Time of day in the viewer's local time: 3:30pm to midnight is night.
  heading: { night: 'Tonight, sorted', day: 'Your shortlist' },
  resultsSubline: 'The plot lines you asked for. Tap to learn more.',
  topPick: 'Top pick',
  onYourWatchlist: 'On your watchlist',
  spinAgain: 'Spin again',
  changeOptions: 'Change options',
  minutes: (n) => (n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m` : `${n} min`),
  episodeMinutes: (n) => `${n} min episodes`,
  seasons: (n) => (n === 1 ? '1 season' : `${n} seasons`),
  miniseries: 'Mini-series',
  // TMDB score with a star, e.g. "★ 7.8".
  score10: (n) => `★ ${n.toFixed(1)}`,

  emptyTitle: 'Nothing fits those answers',
  emptyBody: 'Try more time, fewer genres, or turn off a filter.',
  loadError: 'Could not reach TMDB. Try again in a moment.',

  // The upgrade pop-up. Free viewers answer every question; Pick and Surprise
  // me open this over blurred placeholder picks. No result counts: tight
  // answers can return fewer than five.
  gate: {
    label: 'plot Premium',
    brand: 'plot',
    premium: 'Premium',
    title: 'Your request is ready. Unlock your picks.',
    body: 'Less deciding, more watching. Pick for Me does the scrolling for you.',
    benefits: [
      { title: 'A shortlist, every time you ask', body: 'Answer a few quick questions and get a shortlist that fits your mood.' },
      { title: 'Only what you can watch', body: 'Limit picks to your streaming services, your watchlist, or both.' },
      { title: 'Can’t decide? Surprise me', body: 'One tap, one pick. Spin again if it isn’t the one.' },
    ],
    close: 'Close',
    locked: 'Premium feature',
  },
};

// A feeling word per TMDB genre id, shown under the genre on question 3 and
// used in the sentence ("funny or tense"). Ids are TMDB's fixed genre ids
// (the catalog getGenreCatalog returns), not title ids.
export const GENRE_MOODS = {
  28: 'Explosive',
  12: 'Adventurous',
  16: 'Animated',
  35: 'Funny',
  80: 'Gripping',
  99: 'True story',
  18: 'Moving',
  14: 'Magical',
  36: 'Historical',
  27: 'Scary',
  10402: 'Musical',
  9648: 'Puzzling',
  10749: 'Romantic',
  878: 'Mind-bending',
  10770: 'Made for TV',
  53: 'Tense',
  10752: 'Hard-hitting',
  37: 'Frontier',
  10759: 'Action-packed',
  10765: 'Otherworldly',
  10768: 'Hard-hitting',
  10764: 'Unscripted',
};
