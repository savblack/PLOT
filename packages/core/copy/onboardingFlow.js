// Onboarding copy, shared by the web app (src/pages/OnboardingFlow.jsx) and
// the mobile app (app/onboarding/*). It lives in the core package rather than
// apps/web/src/copy so the two flows can't drift word by word; web re-exports
// it from src/copy/onboardingFlow.js so the Storybook Content page still sees
// every string in one place.

export const ONBOARDING_FLOW = {
  savedTitle: {
    eyebrow: 'Your first pick',
    title: 'Start with this one.',
    subtitle: (title) => `${title || 'This title'} will open as soon as setup is done.`,
    cta: 'Set up my Plot →',
    ctaLabel: 'Set up my Plot',
  },
  // Genre picking used to be step 2. It was the only step that couldn't render
  // without a live TMDB call, and nothing downstream read profiles.genres, so it
  // was cut from signup — genres are set in Settings instead.
  //
  // Step 2 is ONE screen. Mobile used to open it on an intro that greeted the
  // user and revealed the poster grid behind a CTA; web never had one, so it
  // was drift, and it made a two-of-two flow present as three screens. The
  // intro's copy is removed rather than left dormant — nothing rendered it.
  step2: {
    title: 'What do you want to watch?',
    // Says where the picks go, because "what are you watching" read as a
    // question about history: already-watched, in progress, or want to watch.
    subtitle: "We'll add it to your watchlist.",
    searchPlaceholder: 'Search for a movie or TV show…',
    trendingThisWeek: 'Trending this week',
    add: 'Add',
    remove: 'Remove',
  },
  // ── Web onboarding, redesigned (Oct 2026): save a few (with a switching-apps
  // branch), where do you watch, then Home. The
  // name now comes from the sign-in provider, so nothing here asks for it.
  // Mobile runs the same flow (app/onboarding/*); only `step2`'s search and
  // add/remove strings above are still read, by both apps.
  seed: {
    // Reads as a question with or without a name.
    title: (name) => (name ? `What do you want to watch, ${name}?` : 'What do you want to watch?'),
    subtitle: 'Pick a few of this week’s trending titles to start your watchlist. You can always add more or change these later.',
    switchingLead: 'Switching apps?',
    switchingBody: 'Bring your history and watchlist over instead.',
    // Mobile folds the import-source picker into this step: the row above
    // toggles it in place of the poster grid. While the sources are showing
    // the row is the lead alone ("Switching apps?"), with nothing after it.
    // Inline, under the search field. Both keep the step completable.
    searchError: 'Search isn\u2019t working right now.',
    trendingError: 'We couldn\u2019t load this week\u2019s trending titles.',
    retry: 'Retry',
    // A search that worked and matched nothing. A failed one is searchError.
    noResults: 'No titles found.',
    continueWith: (n) => `Continue with ${n} ${n === 1 ? 'title' : 'titles'} →`,
    tapAFew: 'Pick at least one to continue',
  },
  importSources: {
    title: 'Where’s your history now?',
    subtitle: 'Your ratings, watch dates and lists come with it. Pick one to start.',
    sourcesLabel: 'Import sources',
    // Two lanes. Connect first: it is the better outcome (no file hunting).
    connectLane: 'Connect an account',
    connectLaneHint: 'Plot pulls your history itself. Nothing to download.',
    uploadLane: 'Upload an export',
    // Phones (the mobile app, and web below 768px) have nothing to drag, so
    // this one says upload. Desktop keeps the drop wording.
    uploadLaneHint: 'Download the file from the app, then upload it here.',
    uploadLaneHintDesktop: 'Download the file from the app, then drop it here. Or drop it on any tile.',
    // What comes across from each source. Shown under the name on the tile
    // and in the source sheet's header.
    letterboxd: 'Diary, ratings, watchlist and lists',
    trakt: 'History, ratings and watchlist',
    netflix: 'Viewing activity with dates',
    plex: 'Watched on your server',
    simkl: 'History and watchlist, both ways',
    prime: 'Prime Video watch history',
    disney: 'Watch history with dates',
    max: 'Watch history with dates',
    apple: 'Apple TV+ watch history',
    tvtime: 'Shows and movies you tracked',
    imdb: 'Ratings, watchlist and lists',
    // TMDB keeps no watch history, so the tile says what does come across.
    tmdb: 'Watchlist, ratings and lists',
    note: 'It runs in the background while you finish setting up. One entry per title, so nothing doubles up.',
    queuedNote: (name) => `The next one starts when ${name} finishes.`,
    later: 'I’ll do this later',
    addAnotherTitle: 'Add another source',
    // Tile states once a job exists for that source.
    tileImporting: 'Importing',
    tileQueued: 'Queued',
    tileConnected: 'Connected',
    // What the connect sheet promises before the OAuth window opens.
    reads: {
      trakt: ['Watched movies and episodes, with dates', 'Your ratings and your watchlist'],
      plex: ['Movies and episodes watched on your server, with dates'],
      simkl: ['Watched movies and episodes, with dates', 'Your watchlist'],
      tmdb: ['Your watchlist and your own lists', 'Your movie, show and episode ratings. Rated movies are marked watched.'],
    },
    readsNot: {
      trakt: 'Nothing is written back to Trakt',
      plex: 'Nothing is written back to Plex',
      simkl: 'Nothing changes on Simkl until you choose Sync now in Settings',
      tmdb: 'TMDB keeps no watch history, so there are no watch dates. Plot reads your account once, then signs out.',
    },
    continueTo: (name) => `Continue to ${name}`,
    openAgain: 'Open it again',
    // Export steps per file source, in the order a person does them.
    // The last step says upload, not drop: the same lines show on a phone,
    // where the file is chosen from a picker.
    steps: {
      letterboxd: ['On letterboxd.com open Settings › Import & export', 'Choose Export your data', 'Upload the ZIP here. No need to unzip it.'],
      netflix: ['On netflix.com open Account › Profile & parental controls › your profile', 'Choose Viewing activity, then Download all at the bottom', 'Upload NetflixViewingHistory.csv here'],
      prime: ['On amazon.com open Account › Data & Privacy › Request your data', 'Choose Digital content and submit the request', 'When the ZIP arrives, upload the CSV inside it here'],
      disney: ['Sign in at privacy.disneyplus.com', 'Choose Request your data', 'When the ZIP arrives, upload the watch history JSON here'],
      max: ['Sign in at privacycenter.max.com', 'Choose Download your data', 'Upload the CSV or JSON here'],
      apple: ['Sign in at privacy.apple.com and choose Request a copy of your data', 'Pick Apple TV & Purchases', 'When the ZIP arrives, upload the TV interactions JSON here'],
      tvtime: ['Use the export TV Time already sent you (GDPR archive or TV Time Liberator)', 'Upload tracking-prod-records-v2.csv, tracking-prod-records.csv, the JSON or the ZIP here', 'Keep the original file names'],
      imdb: ['On imdb.com open Your Ratings, your Watchlist or a list', 'Choose Export', 'Upload the downloaded CSV here'],
    },
    // One privacy line under the drop zone.
    privacy: 'We read titles, dates and ratings. The file is deleted once it’s matched.',
    privacyNoRatings: 'We read titles and dates. The file is deleted once it’s matched.',
    noRatings: { netflix: 'Netflix exports don’t include ratings.' },
    dropTitle: 'Drop your export here, or browse',
    // The same control on a phone, where it opens the file picker.
    chooseTitle: 'Choose your export file',
    dropFormats: (formats) => `${formats}, unmodified`,
    fileReady: (name, count) => (count ? `${name} · ${count.toLocaleString()} rows · ready to import` : `${name} · ready to import`),
    importRows: (count) => (count ? `Import ${count.toLocaleString()} rows` : 'Import it'),
    changeFile: 'Choose a different file',
  },
  services: {
    title: 'Where do you watch?',
    subtitle: 'We’ll show what’s on your services first. You can change this in Settings.',
    // Region names don't all take "the" (the United States, but not Australia), so no sentence wraps them.
    regionLine: (regionName) => `Your region: ${regionName}.`,
    changeRegion: 'Change',
    regionLabel: 'Region',
    loadError: 'We couldn’t load services right now. You can set them later in Settings.',
  },
  skip: 'Skip',
  stepLabel: (step, total) => `Step ${step} of ${total}`,
  clearSearch: 'Clear search',
  goBack: 'Go back',
  untitled: 'title',
  saveError: 'Something went wrong saving your setup. Please try again.',
  settingUpAccount: 'Setting up account',
  continueArrow: 'Continue →',
};
