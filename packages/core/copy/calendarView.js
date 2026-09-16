// Shared copy: used by the web app and mobile's app/(app)/calendar.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/calendarView.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const CALENDAR_VIEW = {
  eventLabel: {
    episode: 'Episode',
    streaming: 'Streaming',
    reminder: 'Reminder',
  },
  // The two scopes of the web Calendar: your own dates, or every release.
  scope: {
    mine: 'My dates',
    all: 'All releases',
  },
  // Web Calendar side panel: the Show (type) and Genre filter rows.
  filter: {
    show: 'Show',
    genre: 'Genre',
    genreCount: (n) => `${n} genres`,
  },
  // Web Calendar streams: the muted count beside each month heading.
  dateCount: (n) => `${n} ${n === 1 ? 'date' : 'dates'}`,
  releaseCount: (n) => `${n} ${n === 1 ? 'release' : 'releases'}`,
  episodesBehind: (n) => `${n} ${n === 1 ? 'episode' : 'episodes'} behind`,
  seasonPremiere: 'Season premiere',
  inCinemas: 'In cinemas',
  previousMonths: 'Earlier months',
  nextMonths: 'Later months',
  empty: {
    title: 'Nothing coming up',
    body: 'Save a title or start watching a show and its release dates will land here.',
    filtered: 'Nothing matching this filter',
    filteredBody: 'Try a different type or genre.',
  },
  // "All releases" when the feed itself is empty (was Upcoming's empty state).
  releasesEmpty: {
    title: 'Unavailable right now',
    body: 'New releases will appear here. Check back soon.',
  },
};
