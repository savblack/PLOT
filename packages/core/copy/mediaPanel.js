// Shared copy: used by the web app and mobile's components/MediaPanel.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/mediaPanel.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const MEDIA_PANEL = {
  titleDetails: 'Title details',
  talentFallback: 'Talent',
  episodesLoadError: 'Could not load episodes. Try again later.',
  episodeProgressLoadError: 'Could not load your episode progress. Retry before making changes.',
  retryEpisodeProgress: 'Retry episode progress',
  sparseEpisodeProgress: 'Episodes are tracked individually. Mark the series watched when you have finished it.',
  noEpisodesAvailable: 'No episodes available yet.',
  // Per-episode tick tooltips in the episode guide.
  unmarkAsWatched: 'Unmark as watched',
  markAsWatched: 'Mark as watched',
  // The TV-season bulk action, rendered above the episode list on both
  // platforms.
  seasonLabel: (season) => `Season ${season}`,
  seasonWatchedCount: (watched, total) => `${watched} of ${total} watched`,
  markSeasonWatched: 'Mark season watched',
  // The mid-watch summary card: what a series you are part-way through is
  // actually asking you to do next.
  upNext: 'Up next',
  seasonEpisode: (season, episode) => `Season ${season} · Episode ${episode}`,
  episodeRuntime: (minutes) => `${minutes} min`,
  chooseSeason: 'Choose a season',
  unmarkSeasonWatched: 'Unmark season',
  couldNotUpdateSeason: 'Could not update this season right now. Please try again.',
  topFiveTvShows: 'Top 5 TV Shows',
  topFiveMovies: 'Top 5 Movies',
  currentlyRanked: (rank) => `Currently #${rank}`,
  notRanked: 'Not ranked',
  creating: 'Creating…',
  create: 'Create',
  couldNotUpdateWatchStatus: 'Could not update watch status. Please try again.',
  couldNotClearWatchStatus: 'Could not clear watch status. Please try again.',
  // Section heading for the TMDB recommendations row on a title.
  moreLikeThis: 'More like this',
  // The franchise card under the recommendations row (movies only: TMDB has
  // no collection concept for series).
  partOfCollection: 'Part of a collection',
  collectionProgress: (watched, total) => `${total} movie${total === 1 ? '' : 's'} · ${watched} watched`,
  saveCollectionAsList: 'Save as list',
  // The franchise panel's progress card: one segment per film, so it reads as
  // "which three of nine" rather than a percentage.
  yourRun: 'Your run',
  collectionRunCount: (watched, total) => `${watched} of ${total} watched`,
  collectionNextUp: (title) => `Next up: ${title}`,
  collectionAllWatched: 'You have seen every one.',
  collectionYears: (first, last) => (first === last ? `${first}` : `${first} – ${last}`),
  savingCollection: 'Saving…',
  collectionSaved: 'Saved to My Lists',
  couldNotSaveCollection: 'Could not save this collection. Please try again.',
  viewing: 'Viewing',
  // Search: the group of franchise hits above the title results, and the
  // meta line under each.
  collectionsHeading: 'Collections',
  collectionResultMeta: 'Collection',
  collectionFilmCount: (total) => `${total} movie${total === 1 ? '' : 's'}`,
  couldNotLoadCollection: "Couldn't load this collection. Check your connection and try again.",
  trailerFallback: 'Trailer',
  // Where to watch is a disclosure on web: collapsed it shows the provider
  // logos and nothing else, so the heading and the region line carry the
  // meaning when it opens.
  whereToWatch: 'Where to watch',
  offersIn: (region) => `Offers in ${region}`,
  changeRegion: 'Change region',
  moreProviders: (count) => `+${count}`,
  // The two scores read as a pair, with the audience review beside them.
  critics: 'Critics',
  audience: 'Audience',
  // The bar pinned to the foot of the panel. It is present whether or not
  // anything has been written: the heading is the invitation until there is
  // something to summarise.
  yourTake: 'Your take',
  leaveNoteOrReview: 'Leave a note or review',
  takeHint: 'Rate it, write a review, or keep a private note',
  takeNeedsWatch: 'Mark this watched to rate it and write a review.',
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
  // A saved review is a record, not a form: the panel shows it as prose with an
  // overflow menu, and only the edit state renders inputs. These strings cover
  // all three states (saved / editing / nothing written yet) on both platforms.
  yourReview: 'Your review',
  yourRating: 'Your rating',
  watchedOn: 'Watched on',
  watchedOnDate: (date) => `Watched ${date}`,
  outOfFive: (rating) => `${rating} out of 5`,
  rateAndReview: 'Rate and review',
  writeReview: 'Write a review',
  editingYourReview: 'Editing your review',
  reviewOptions: 'Review options',
  removeReview: 'Remove review',
  couldNotSaveReview: 'Could not save your review. Please try again.',
  charactersLeft: (count) => `${count} left`,
};
