// The search palette: one box that finds titles, franchises, people and
// friends. Web renders it as a command palette (Cmd/Ctrl+K, or the Search
// item); mobile as its search screen, opened from the header's search button.
export const SEARCH_PALETTE = {
  placeholder: 'Search titles, people and friends…',
  label: 'Search Plot',
  loading: 'Searching',
  // Before anything is typed.
  hintTitle: 'Find anything',
  hintBody: 'Titles, franchises, actors, directors and friends, all from one box.',
  hintFriends: 'to find friends',
  hintPeople: 'for actors and directors',
  // The "Search in" row: look everywhere, or only at one page's own titles.
  // The page names themselves come from the nav (APP_NAV_ITEMS).
  searchIn: 'Search in:',
  everywhere: 'Everywhere',
  placeholderIn: (place) => `Search ${place}…`,
  hintTitleIn: (place) => `Search ${place}`,
  placeHint: {
    home: 'Only the titles on your Home shelves right now.',
    calendar: 'Only titles with upcoming dates in your Calendar.',
    lists: 'Only titles saved in your lists.',
    smart: 'Only titles your smart lists have found.',
    history: 'Only titles you have watched.',
  },
  noneIn: (place) => `Nothing in ${place} matches. Try a different spelling, or search everywhere.`,
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
    tv: 'TV',
    person: 'Person',
    friend: 'Friend',
  },
  // Footer key hints.
  move: 'move',
  open: 'open',
  saveToList: 'save to list',
  close: 'esc, close search',
  filters: 'Filter:',
  filterFriends: 'friends',
  filterPeople: 'people',
};
