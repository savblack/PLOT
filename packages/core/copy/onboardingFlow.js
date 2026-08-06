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
  // Step 2 opens on an intro rather than dropping the user straight into a
  // poster grid: picking titles reads as ambiguous ("have I watched these?")
  // without a line first saying what the picks are for.
  step2: {
    intro: {
      greeting: (name) => (name ? `Hi ${name}!` : 'Hi there!'),
      lead: "Let's start on a good note.",
      // Honest, not aspirational: list_items feeds user_title_signals, which
      // is what get_for_you() scores. See the for_you_weighted_signals
      // migration.
      pitch: 'Tell us what you want to watch and your recommendations get better.',
      cta: "Let's go",
      ctaArrow: "Let's go →",
      toApp: 'Take me to the app instead',
    },
    title: 'What do you want to watch?',
    // Says where the picks go, because "what are you watching" read as a
    // question about history: already-watched, in progress, or want to watch.
    subtitle: "Pick anything you'd like to get to. We'll add it to your watchlist.",
    searchPlaceholder: 'Search for a show or movie…',
    trendingThisWeek: 'Trending this week',
    add: 'Add',
    remove: 'Remove',
  },
  stepLabel: (step, total) => `Step ${step} of ${total}`,
  clearSearch: 'Clear search',
  goBack: 'Go back',
  deselect: 'Deselect',
  select: 'Select',
  untitled: 'title',
  saveError: 'Something went wrong saving your setup. Please try again.',
  settingUpAccount: 'Setting up account',
  startWatching: 'Start watching',
  startWatchingArrow: 'Start watching →',
  continueArrow: 'Continue →',
  skipThisStep: 'Skip this step',
};
