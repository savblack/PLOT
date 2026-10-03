export const DISCOVER_VIEW = {
  mostAnticipatedTitle: 'Most Anticipated',
  mostAnticipatedSubtitle: 'Coming soon',
  upNext: 'Up next',
  startHere: 'Start here',
  startHereBody: 'Choose a show that’s airing now. We’ll show you when the next episode drops here.',
  findAiringShow: 'Find a show airing now',
  nothingUpcoming: 'Nothing coming up yet',
  nothingUpcomingBody: 'Your saved shows are between seasons or have no new episodes. Choose one that’s airing now to see what’s next.',
  refreshing: 'Updating…',
  offline: 'You’re offline',
  offlineBody: 'Reconnect to refresh upcoming episodes. Your saved shows are still safe.',
  loadError: 'We couldn’t load what’s next',
  loadErrorBody: 'There was a temporary problem. Nothing in your saved shows has changed.',
  retry: 'Try again',
  onThisDay: 'On this day',
  releasedThisDay: (year) => `Released this day in ${year}.`,
  // Home's saved-titles shelf: the bottom of mobile Home, and the top of web
  // Home during the first run.
  savedToWatch: 'Saved to watch',
  // Home's time-of-day greeting (greeting.js picks the part of day). Reads
  // without a name for accounts that never gave one.
  greeting: {
    morning: 'Good morning',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    late: 'Up late',
  },
};
