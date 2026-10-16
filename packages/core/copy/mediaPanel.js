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
  // Season 0 in the episode guide. Not "Season 0".
  seasonListLabel: (season) => (Number(season) === 0 ? 'Specials' : `Season ${season}`),
  markSpecialsWatched: 'Mark specials watched',
  unmarkSpecialsWatched: 'Unmark specials',
  seasonWatchedCount: (watched, total) => `${watched} of ${total} watched`,
  markSeasonWatched: 'Mark season watched',
  // The mid-watch summary card: what a series you are part-way through is
  // actually asking you to do next.
  upNext: 'Up next',
  seasonEpisode: (season, episode) => `Season ${season} · Episode ${episode}`,
  episodeRuntime: (minutes) => `${minutes} min`,
  // Free. "3h 12m left" on Continue watching, and the series total under the
  // title panel progress bar. Ends at sits beside the runtime.
  endsAt: (time) => `Ends at ${time}`,
  parentalGuide: 'Parental guide',
  hideParentalGuide: 'Hide',
  showParentalGuide: 'Show guide',
  couldNotUpdateParentalGuide: 'Could not update the parental guide. Try again.',
  timeLeft: (duration) => `${duration} left`,
  episodesLeft: (count) => (count === 1 ? '1 episode left' : `${count} episodes left`),
  episodesAndTimeLeft: (count, duration) => (
    count === 1 ? `1 episode · ${duration} left` : `${count} episodes · ${duration} left`
  ),
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
  yourRating: 'Your rating',
  watchedOn: 'Watched on',
  couldNotSaveReview: 'Could not save your review. Please try again.',

  // The foot bar pinned to the bottom of the title panel. One shape in every
  // state: a head line, the stars, then a Review box and a Private note box
  // once the title is watched. Web and mobile draw it from the same state, in
  // @plot/core/useTitleFootBar.js.
  foot: {
    unwatchedHead: 'Watched it?',
    unwatchedHint: 'Tap a star to rate it',
    iveWatched: "I've watched",
    imWatching: "I'm watching",
    head: 'Thoughts?',
    watchedOn: (date) => `Watched on ${date}`,
    watchedJustNow: 'Watched',
    undo: 'Undo',
    changeWatchedDate: (label) => `${label}, change date`,
    reviewLabel: 'Review',
    reviewEmpty: 'What did you think?',
    // Who can read a review follows the viewer's own profile setting; see
    // PROFILE_PRIVACY for the rules these two lines summarise.
    reviewAudiencePublic: 'Visible on your profile',
    reviewAudiencePrivate: 'Visible to your followers',
    // Tags a box whose text is an unsaved draft kept after closing the editor.
    draft: 'Draft',
    addReview: 'Add your review',
    editReview: 'Edit your review',
    noteLabel: 'Private note',
    noteEmpty: 'Add a thought for later',
    noteAudience: 'Only visible to you',
    addNote: 'Add your private note',
    editNote: 'Edit your private note',
    editorTitle: 'Review and notes',
    rating: 'Rating',
    saved: 'Saved',
    reviewPlaceholder: 'What did you think?',
    ratingStars: (stars) => `Rate ${stars - 0.5} or ${stars} stars`,
    // One half-star target on a touch screen, where each half is its own button.
    rateStars: (stars) => `Rate ${stars} ${stars === 1 ? 'star' : 'stars'}`,
    watchedAndRated: (stars) => `Watched and rated ${stars} ${stars === 1 ? 'star' : 'stars'}`,
    watchedRemoved: 'Watched removed',
    deleted: 'Deleted',
  },

  // The episode-ratings sheet above the season row. TMDB is the audience
  // grid. Yours reads imported episode ratings and leaves the rest blank.
  episodeRatingsTitle: 'Episode ratings',
  episodeRatingsTmdb: 'TMDB',
  episodeRatingsYours: 'Yours',
  episodeRatingsNoneTmdb: 'No episode scores for this show yet.',
  episodeRatingsNoneYours: "You haven't rated episodes of this show.",
  episodeRatingsSignIn: 'Sign in to see your episode ratings.',
  episodeRatingsLoadError: 'Could not load episode ratings. Try again.',
  episodeRatingsRetry: 'Try again',
  episodeRatingsClose: 'Close',
  episodeRatingsEpisode: (episode) => `Episode ${episode}`,
  episodeRatingsHolds: (season, through, episode, score, yours) => (
    yours
      ? `Season ${season} holds through episode ${through}. Your low point is episode ${episode}, at ${score}.`
      : `Season ${season} holds through episode ${through}. The low point is episode ${episode}, at ${score}.`
  ),
  episodeRatingsLowPoint: (season, episode, score, yours) => (
    yours
      ? `Your low point is season ${season}, episode ${episode}, at ${score}.`
      : `The low point is season ${season}, episode ${episode}, at ${score}.`
  ),
  episodeRatingsRated: (rated, total) => `You've rated ${rated} of ${total} episodes.`,
  episodeRatingsVotes: (count) => `${count} votes`,
  episodeRatingsUnrated: 'Unrated',
  episodeRatingsCell: (season, episode, name, score) => `Season ${season}, episode ${episode}, ${name}, ${score}`,
  episodeRatingsBandPeak: '9 and up',
  episodeRatingsBandGood: '8',
  episodeRatingsBandFine: '7',
  episodeRatingsBandSoft: '6',
  episodeRatingsBandFall: 'Under 6',
};
