// Shared copy for the lists Plot curates (the card in Home's "plot's Picks").
// Used by the web app; mobile reads the same module when it ships the card.
export const CURATED_LISTS = Object.freeze({
  cardBadge: 'plot list',
  cardMeta: (count, source) => `${count} titles · ${source}`,
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
