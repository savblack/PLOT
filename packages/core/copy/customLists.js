import { FREE_CUSTOM_LIST_CAP } from '../premium.js';

export const CUSTOM_LISTS = Object.freeze({
  // The built-in watchlist's name: its My Lists section and Home's pinned shelf.
  wantToWatch: 'Watchlist',
  // One calm prompt per empty My Lists section: what belongs here and the next step.
  emptyPrompts: Object.freeze({
    want: Object.freeze({ title: 'Nothing saved yet', body: 'Tap the bookmark on any title and it lands here.', action: 'Find something to watch' }),
    lists: Object.freeze({ title: 'No lists yet', body: 'Make one for a mood, a genre or a friend.', action: 'Create a list' }),
    topFive: Object.freeze({
      title: (label) => `Your Top 5 ${label}`,
      body: 'Start with the one you would pick over everything else.',
      action: 'Add',
    }),
  }),
  searchPlaceholder: 'Search my lists',
  searchThisList: 'Search this list',
  noMatch: 'No items match the current filter.',
  listOrder: 'List order',
  sortList: 'Sort list',
  titleAscending: 'Title A to Z',
  titleDescending: 'Title Z to A',
  // The Watching list's sort menu (watchingOrder.js WATCHING_SORTS).
  sortWatching: 'Sort watching',
  watchingSort: Object.freeze({
    last_watched: 'Last watched',
    next_air_date: 'Next episode air date',
    recently_added: 'Recently added',
  }),
  backToMyLists: 'My Lists',
  yourLists: 'Your lists',
  gridView: 'Grid view',
  listView: 'List view',
  searchResults: 'Search results',
  noSearchResults: 'No titles match your search and filters.',
  searchCount: count => `${count} ${count === 1 ? 'title' : 'titles'} found`,
  // The left column on web: an index of every list, capped so a long
  // collection does not turn the column into its own scroll.
  jumpTo: 'Jump to',
  // My Lists sections: fold one shut, or put them in your own order
  // (profile.ui_prefs.myLists, rules in uiPrefs.js).
  sections: Object.freeze({
    title: 'Customize My Lists',
    body: 'Drag a section, or use the arrows, to put My Lists in the order you like.',
    moveUp: (name) => `Move ${name} up`,
    moveDown: (name) => `Move ${name} down`,
    drag: (name) => `Drag to reorder ${name}`,
    reset: 'Reset order',
    saveError: 'That change didn’t save. Try again.',
    collapse: (name) => `Collapse ${name}`,
    expand: (name) => `Expand ${name}`,
  }),
  // The dashed tile where Watching has nothing in it.
  watchingEmptyTile: 'Add a show',
  watchingEmptyNote: 'What are you watching now?',
  viewMore: count => `View ${count} more`,
  viewLess: 'View less',
  summary: (lists, titles) =>
    `${lists} ${lists === 1 ? 'list' : 'lists'} · ${titles} ${titles === 1 ? 'title' : 'titles'}`,
  // The undo toast after creating a list (copy/undo.js adds the full stop).
  created: 'List created',
  limitMessage: `You can create up to ${FREE_CUSTOM_LIST_CAP} custom lists for free. Plot Premium has unlimited custom lists.`,
});
