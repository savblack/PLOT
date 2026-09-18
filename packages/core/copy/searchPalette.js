// The search palette: one box that finds titles, franchises, people and
// friends. Web renders it as a command palette (Cmd/Ctrl+K, or the Search
// item); mobile has not adopted it yet and still reads MEDIA.searchPlaceholder.
export const SEARCH_PALETTE = {
  placeholder: 'Search titles, people and friends…',
  label: 'Search PLOT',
  loading: 'Searching',
  // Before anything is typed.
  hintTitle: 'Find anything',
  hintBody: 'Titles, franchises, actors, directors and friends, all from one box.',
  hintFriends: 'to find friends',
  hintPeople: 'for actors and directors',
  // After a search that found nothing.
  noResults: 'No results',
  noResultsBody: 'Try a different spelling, or add a year.',
  noFriends: 'No friends found. Try a different name.',
  noPeople: 'No one by that name. Try a different spelling.',
  // Before anything is typed, the last few searches.
  recent: 'Recent',
  clearRecent: 'Clear',
  // Right-hand labels for the viewer's own titles that lead the list.
  // "Watched" is MEDIA.watched and "Watching" is MEDIA_PANEL.watching; only
  // the list membership needed its own words.
  status: {
    saved: 'In your list',
  },
  // Right-hand kind labels, one word each so the column stays narrow.
  kind: {
    collection: 'Franchise',
    movie: 'Movie',
    tv: 'Series',
    person: 'Person',
    friend: 'Friend',
  },
  // Footer key hints.
  move: 'move',
  open: 'open',
  saveToList: 'save to list',
  close: 'close',
  filters: 'Filter:',
  filterFriends: 'friends',
  filterPeople: 'people',
};
