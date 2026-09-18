import { FREE_CUSTOM_LIST_CAP } from '../premium.js';

export const CUSTOM_LISTS = Object.freeze({
  searchPlaceholder: 'Search my lists',
  searchResults: 'Search results',
  noSearchResults: 'No titles match your search and filters.',
  searchCount: count => `${count} ${count === 1 ? 'title' : 'titles'} found`,
  limitTitle: 'plot Premium coming soon',
  limitMessage: `You can create up to ${FREE_CUSTOM_LIST_CAP} custom lists for free. Unlimited custom lists are a plot Premium feature, coming soon.`,
});
