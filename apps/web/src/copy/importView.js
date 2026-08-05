export const IMPORT_VIEW = {
  noneAlreadyInHistory: 'None already in your history',
  notMatched: 'Not matched',
  alreadyInHistory: 'Already in history',
  // Only reachable with the "log every rewatch" preference off, where several
  // watches of one title become a single history entry.
  mergedIntoOneEntry: 'Merged into one entry',
  partialFailure: (n) => `${n} title${n !== 1 ? 's' : ''} could not be saved. Nothing already in your history was changed, so you can safely run the import again.`,
  newBadge: 'New',
  haveBadge: 'Have',
  importing: 'Importing…',
  nothingNew: 'Nothing new',
  importArrow: 'Import →',
};
