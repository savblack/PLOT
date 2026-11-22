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
  // The Calendar's own filter box. Worded for the page so it doesn't read as
  // a second copy of the sidebar's Search (which opens the title palette).
  search: 'Search the calendar',
  // Web side filter panel: the Genre rows. Its type heading is MEDIA.typeHeading
  // ("Type"; it read "Show" until 17 Nov 2026).
  filter: {
    genre: 'Genre',
    genreCount: (n) => `${n} genres`,
  },
  // Web Calendar streams: the muted count beside each month heading.
  dateCount: (n) => `${n} ${n === 1 ? 'date' : 'dates'}`,
  releaseCount: (n) => `${n} ${n === 1 ? 'release' : 'releases'}`,
  episodesBehind: (n) => `${n} ${n === 1 ? 'episode' : 'episodes'} behind`,
  seasonPremiere: 'Season premiere',
  inCinemas: 'In theaters',
  previousMonths: 'Earlier months',
  nextMonths: 'Later months',
  empty: {
    title: 'Nothing coming up.',
    body: 'Save a title or start watching a show and its release dates will land here.',
    filtered: 'Nothing matching this filter',
    filteredBody: 'Try a different type or genre.',
  },
  // "All releases" when the feed itself is empty (was Upcoming's empty state).
  releasesEmpty: {
    title: 'Unavailable right now',
    body: 'New releases will appear here. Check back soon.',
  },
  // The card under the web Calendar's mini months. It opens the sheet below,
  // and its words follow where the person's calendar is: nothing saved yet,
  // saved titles with no dates ahead, or dates already on it.
  suggestCard: {
    start: {
      title: 'Start your calendar',
      body: 'Add a show that’s airing or a movie coming out soon. New episodes and release dates show up here.',
      action: 'Find something to add',
    },
    quiet: {
      title: 'Your calendar is quiet',
      body: 'Your shows are between seasons and your movies are already out. Add something airing now or a movie coming soon.',
      action: 'See what’s coming soon',
    },
    more: {
      title: 'Add to your calendar',
      body: 'Find another show on the air or a new movie coming to theaters or streaming.',
      action: 'Browse what’s coming up',
    },
  },
  // The quick-add sheet on the web calendar. Mobile does not render it yet.
  suggest: {
    title: 'Fill your calendar',
    body: 'Add a show that’s on the air or a movie coming out soon. Its next date lands on your calendar right away.',
    airingHeading: 'Airing now',
    airingBody: 'New episodes are still on the way.',
    moviesHeading: 'Movies coming soon',
    moviesBody: 'In theaters or streaming soon. Add one and its release date goes on your calendar.',
    nextEpisode: (code, when) => (code ? `${code} airs ${when}` : `Next episode airs ${when}`),
    inTheaters: (when) => `In theaters ${when}`,
    streaming: (when) => `Streaming ${when}`,
    added: 'Added',
    nothingToSuggest: 'Nothing new to suggest right now.',
    unavailable: 'Suggestions are unavailable right now.',
    retry: 'Try again',
  },
};
