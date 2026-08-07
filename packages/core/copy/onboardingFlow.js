// Onboarding copy, shared by the web app (src/pages/OnboardingFlow.jsx) and
// the mobile app (app/onboarding/*). It lives in the core package rather than
// apps/web/src/copy so the two flows can't drift word by word; web re-exports
// it from src/copy/onboardingFlow.js so the Storybook Content page still sees
// every string in one place.

// Soft target for onboarding step 2's swipe deck — shown in the heading and
// the progress bar's segment count, never enforced as a minimum (Continue
// and Skip are always tappable regardless of how many titles are liked).
export const SEED_LIKE_TARGET = 6;

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
    title: (target) => `Swipe right on ${target} titles you like`,
    subtitle: 'Curating your recommendations…',
    progressA11yLabel: (count, target) => `${count} of ${target} liked`,
    likeLabel: (title) => `Like ${title}`,
    passLabel: (title) => `Pass on ${title}`,
    deckComplete: "You've swiped through today's trending picks.",
    loadError: "Couldn't load titles to swipe on.",
    retry: 'Try again',
  },
  stepLabel: (step, total) => `Step ${step} of ${total}`,
  goBack: 'Go back',
  untitled: 'title',
  saveError: 'Something went wrong saving your setup. Please try again.',
  settingUpAccount: 'Setting up account',
  startWatching: 'Start watching',
  startWatchingArrow: 'Start watching →',
  continueArrow: 'Continue →',
  skipThisStep: 'Skip this step',
};
