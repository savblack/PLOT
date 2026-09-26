import { FREE_CUSTOM_LIST_CAP } from '../premium.js';

export const CUSTOM_LISTS = Object.freeze({
  searchPlaceholder: 'Search my lists',
  searchThisList: 'Search this list',
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
  limitMessage: `You can create up to ${FREE_CUSTOM_LIST_CAP} custom lists for free. Unlimited custom lists are planned for plot Premium.`,
});
