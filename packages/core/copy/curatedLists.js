// Shared copy for the lists Plot curates (Home's "Lists from plot"). Used by
// the web app; mobile reads the same module when it ships the shelf.
export const CURATED_LISTS = Object.freeze({
  shelfTitle: 'Lists from plot',
  shelfSubtitle: 'Save one to make it yours',
  titleCount: count => `${count} ${count === 1 ? 'title' : 'titles'}`,
  source: name => `Source: ${name}`,
  viewSource: 'View the original list',
  save: 'Save to my lists',
  saving: 'Saving...',
  saved: 'Saved to My Lists',
  savedAgain: 'Added to your existing list',
  openMine: 'Open my list',
  signIn: 'Sign in to save this list',
  couldNotSave: 'Could not save this list. Try again.',
  closeLabel: 'Close',
});
