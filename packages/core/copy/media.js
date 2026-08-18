// Shared copy: used by the web app and media labels and actions on both platforms.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/media.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

// Shared copy for browsing/discovery surfaces (Search, Discover, Guide,
// Watchlist) — media-type labels, watchlist actions, and section chrome that
// repeat identically across those views.

export const MEDIA = {
  movie: 'Movie',
  movies: 'Movies',
  tv: 'TV',
  tvSeries: 'TV Series',
  series: 'Series',
  cinema: 'Cinema',
  unknown: 'Unknown',
  saveToWatchlist: 'Add to watchlist',
  removeFromWatchlist: 'Remove from watchlist',
  today: 'Today',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  typeHeading: 'Type',
  genreHeading: 'Genre',
  collapseAllSections: 'Collapse all sections',
  expandAllSections: 'Expand all sections',
  fromTheArchive: 'From the archive',
  fromTheArchiveBadge: 'From the Archive',
  onThisDay: 'On This Day',
  watched: 'Watched',
  comingSoon: 'Coming Soon',
  inCinemas: 'In Cinemas',
  // Watch-status actions. These live here rather than in mediaPanel because
  // three surfaces render them — the detail panel, the search rows and the
  // Watching list — and a per-surface copy is how the same label ends up
  // worded two ways. onboardingFlow.startWatchingArrow is a DIFFERENT concept
  // (the onboarding CTA, "begin using PLOT"), so it stays where it is.
  markWatched: 'Mark watched',
  markUnwatched: 'Mark unwatched',
  markAllWatched: 'Mark all watched',
  startWatching: 'Start watching',
  stopWatching: 'Stop watching',
  couldNotCreateList: 'Could not create the list. Please try again.',
  removeFromList: 'Remove from list',
  addToList: 'Add to list',
};
