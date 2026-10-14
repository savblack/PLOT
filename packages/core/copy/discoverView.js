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
  // plot's Picks takes turns between its cards.
  picks: {
    trendingTv: 'Trending TV',
    trendingMovie: 'Trending movie',
    cardsLabel: 'plot\'s Picks',
    showCard: (n) => `Show card ${n}`,
  },
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
  // The line under the greeting: how many of the last seven days had
  // something logged, and the best run. Reads "4 nights this week · best
  // streak 9"; with no best run yet, the first half alone.
  weekLine: (nights, best) => {
    const n = `${nights} ${nights === 1 ? 'night' : 'nights'} this week`;
    return best > 1 ? `${n} · best streak ${best}` : n;
  },
  weekEmpty: 'Nothing logged this week yet',
  // Up next with nothing saved: three trending posters stand in for the shelf,
  // each with its bookmark, so the first saves happen in place.
  emptyUpNext: {
    body: 'Save three titles to build your plot. Start with what\u2019s trending.',
    searchLink: 'Search for something else',
  },
  // The round floating entry to Pick for Me, bottom right above the tab bar.
  tonightFab: 'Pick for Me',
};
