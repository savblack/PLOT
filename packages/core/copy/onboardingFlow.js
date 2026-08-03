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
  step2: {
    title: 'Where are you?',
    subtitle: 'We use this to show content available in your region.',
  },
  step3: {
    title: 'What do you like?',
    subtitle: 'Pick a few to shape what we recommend.',
  },
  step4: {
    title: 'What are you watching?',
    subtitle: 'Give your watchlist a head start.',
    searchPlaceholder: 'Search for a show or movie…',
    trendingThisWeek: 'Trending this week',
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
