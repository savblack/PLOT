// Shared copy: used by the web app and mobile's app/(app)/my-lists.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/watchlistView.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const WATCHLIST_VIEW = {
  watchingTab: 'Watching',
  savedTab: 'Saved',
  movingToWatching: 'Moving to Watching',
  startWatching: 'Start watching',
};
