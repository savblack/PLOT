export const QUICK_ADD = Object.freeze({
  title: 'What are you watching right now?',
  search: 'Search for a show or movie',
  progress: count => `${count} ${count === 1 ? 'title' : 'titles'} in your library`,
  hint: 'Movies go to your Watchlist',
  unavailable: 'Could not add that title. Try again.',
});
