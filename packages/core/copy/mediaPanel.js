// Shared copy: used by the web app and mobile's components/MediaPanel.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/mediaPanel.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const MEDIA_PANEL = {
  talentFallback: 'Talent',
  episodesLoadError: 'Could not load episodes. Try again later.',
  noEpisodesAvailable: 'No episodes available yet.',
  markUnwatched: 'Mark unwatched',
  markWatched: 'Mark watched',
  // The TV-season bulk action. Mobile renders it today; web has no such
  // control yet, so this is here for when it gains one — the wording is
  // agreed now so the two can't diverge later.
  markAllWatched: 'Mark all watched',
  unmarkAsWatched: 'Unmark as watched',
  markAsWatched: 'Mark as watched',
  couldNotCreateList: 'Could not create the list. Please try again.',
  top10TvShows: 'TV Shows',
  top10Movies: 'Movies',
  currentlyRanked: (rank) => `Currently #${rank}`,
  notRanked: 'Not ranked',
  creating: 'Creating…',
  create: 'Create',
  couldNotUpdateWatchStatus: 'Could not update watch status. Please try again.',
  couldNotClearWatchStatus: 'Could not clear watch status. Please try again.',
  trailerFallback: 'Trailer',
  watching: 'Watching',
  didntFinish: "Didn't finish",
  status: 'Status',
  updating: 'Updating…',
  clearing: 'Clearing…',
  clearStatus: 'Clear status',
  inWatchlist: 'In watchlist',
  addToWatchlist: 'Add to watchlist',
  onList: 'On list',
  list: 'List',
  noRating: 'No rating',
  savingReview: 'Saving review',
  saveChanges: 'Save changes',
  editReview: 'Edit review',
  saveReview: 'Save review',
};
