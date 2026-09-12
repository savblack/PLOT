// Onboarding copy, shared by the web app (src/pages/OnboardingFlow.jsx) and
// the mobile app (app/onboarding/*). It lives in the core package rather than
// apps/web/src/copy so the two flows can't drift word by word; web re-exports
// it from src/copy/onboardingFlow.js so the Storybook Content page still sees
// every string in one place.

export const ONBOARDING_FLOW = {
  step1: {
    title: "What's your name?",
    subtitle: 'So we can make PLOT yours.',
    placeholder: 'First name',
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
    subtitle: "Pick anything you'd like to get to. We'll add it to your watchlist.",
    searchPlaceholder: 'Search for a movie or TV show…',
    trendingThisWeek: 'Trending this week',
    add: 'Add',
    remove: 'Remove',
  },
  stepLabel: (step, total) => `Step ${step} of ${total}`,
  clearSearch: 'Clear search',
  goBack: 'Go back',
  untitled: 'title',
  saveError: 'Something went wrong saving your setup. Please try again.',
  settingUpAccount: 'Setting up account',
  startWatching: 'Start watching',
  startWatchingArrow: 'Start watching →',
  continueArrow: 'Continue →',
  skipThisStep: 'Skip this step',
};
