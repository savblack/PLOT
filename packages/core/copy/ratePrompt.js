// The three rating prompts, shared by web and mobile. A title marked watched
// without a rating is asked about once more: on Home the next day (the card),
// right after the title panel closes (the toast), and the next morning (a
// local notification). All three stop the moment a rating lands.
export const RATE_PROMPT = {
  // The Home card and the notification both ask the same question.
  question: (title) => `How was ${title}?`,
  watchedToday: 'Watched today',
  watchedYesterday: 'Watched last night',
  watchedDaysAgo: (n) => `Watched ${n} days ago`,
  dismiss: 'Not now',
  dismissLabel: (title) => `Don’t ask about ${title}`,
  // The toast after the panel closes on a fresh, unrated mark.
  toast: 'Watched. Rate it?',
  rated: (stars) => `Rated ${stars} ${stars === 1 ? 'star' : 'stars'}`,
  notificationBody: 'Tap to rate it.',
};
