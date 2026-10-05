// "Finishing touches": the first-run card on Home after onboarding (Oct 2026
// redesign). Shared with mobile so both apps say the same thing. Words that
// differ by region (favourite) are passed in from spelling.js by the caller,
// never hardcoded here.

export const FINISHING_TOUCHES = {
  title: 'Finishing touches',
  count: (done, total) => `${done} of ${total}`,
  progressLabel: (done, total) => `${done} of ${total} done`,
  hide: 'Hide for now',
  expand: 'Expand finishing touches',
  collapse: 'Collapse finishing touches',
  done: 'Done',
  notDone: 'Not done',

  steps: {
    watchlist: {
      title: 'Start your watchlist',
      sub: (n) => `${n} ${n === 1 ? 'title' : 'titles'} saved`,
    },
    friends: {
      title: 'Find your people',
      sub: 'Follow friends and see what they’re watching.',
      cta: 'Find friends',
      doneSub: (n) => `Following ${n} ${n === 1 ? 'person' : 'people'}`,
    },
    import: {
      title: 'Bring your history over',
      sub: 'From Letterboxd, Trakt, Netflix or Plex.',
      cta: 'Import',
      doneSub: 'History imported',
    },
    people: {
      // `favourites` is the region-spelled plural from favoriteWords().pluralLower.
      title: (favourites) => `Follow your ${favourites}`,
      sub: 'Be the first to know what they do next.',
      cta: 'See who',
      doneSub: (name, more) => (more > 0 ? `Following ${name} and ${more} more` : `Following ${name}`),
    },
  },

  friendsSheet: {
    title: 'Find your people',
    sub: 'Follow a few people to see what they’re watching.',
    follow: 'Follow',
    following: 'Following',
    requested: 'Requested',
    empty: 'No suggestions yet. Search for a friend by name or username.',
    search: 'Search for people',
    loadError: 'We couldn’t load suggestions. Try again in a moment.',
  },

  importSheet: {
    title: 'Bring your history over',
    sub: 'Pick where you’ve been tracking. Your ratings come too.',
  },

  peopleSheet: {
    title: (favourites) => `Follow your ${favourites}`,
    sub: 'Their new work lands in Your people, and you hear on release day.',
    previewLabel: 'Preview',
    previewTitle: 'Your people',
    previewAlert: (title, name) => `Out today: ${title}, from ${name}`,
    previewAlertLead: 'Out today:',
    fromWatchlist: 'From your watchlist',
    empty: 'Save a few titles and we’ll suggest the actors and directors behind them.',
  },

  close: 'Close',
  ready: 'Your Plot is ready',
  readyBody: 'All done. Enjoy the show.',
  nice: 'Nice',
};
