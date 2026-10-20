import { FREE_CUSTOM_LIST_CAP } from '../premium.js';

export const CUSTOM_LISTS = Object.freeze({
  // The built-in watchlist's name: its My Lists section and Home's pinned shelf.
  wantToWatch: 'Want to Watch',
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
  viewMore: count => `View ${count} more`,
  viewLess: 'View less',
  summary: (lists, titles) =>
    `${lists} ${lists === 1 ? 'list' : 'lists'} · ${titles} ${titles === 1 ? 'title' : 'titles'}`,
  // The undo toast after creating a list (copy/undo.js adds the full stop).
  created: 'List created',
  limitMessage: `You can create up to ${FREE_CUSTOM_LIST_CAP} custom lists for free. Unlimited custom lists are planned for plot Premium.`,
});
