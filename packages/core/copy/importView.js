// Shared copy: used by the web app and mobile's ImportHistoryModal.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/importView.js re-exports it so src/copy stays the single
// place the web app and the Storybook Content page look for copy.

export const IMPORT_VIEW = {
  chooseSource: 'Choose where you want to import from.',
  accountImportSubtitle: 'Import from your account',
  fileImportSubtitle: 'Drop your viewing history',
  connectionImportHint: 'Connect once to copy your watch history into Plot. This does not turn on automatic or two-way sync.',
  connectToImport: (provider) => `Connect ${provider} to import`,
  connectedReady: (provider) => `${provider} is connected and ready to import.`,
  importFrom: (provider) => `Import from ${provider}`,
  importingFrom: (provider) => `Importing from ${provider}…`,
  connectionRequired: (provider) => `Connect ${provider} first, then return here to import your history.`,
  plexServerRequired: 'Your Plex Media Server must be running and reachable while the import runs.',
  letterboxdExportHint: 'Settings → Data → Export your data → unzip → choose diary.csv or watched.csv',
  imdbName: 'IMDb',
  imdbExportHint: 'Your Ratings → Export → choose ratings.csv',
  imdbFileName: 'ratings.csv',
  imdbInstructions: [
    'Go to imdb.com and sign in',
    'Open your ratings from your profile menu',
    'Select Export in the top right',
    'Upload the downloaded ratings.csv file here',
  ],
  importedSummary: (imported, existing) => `${imported} title${imported !== 1 ? 's' : ''} added${existing ? `, ${existing} already in your history` : ''}.`,
  importFailed: 'We could not import this history. Nothing already in Plot was changed. Please try again.',
  noneAlreadyInHistory: 'None already in your history',
  notMatched: 'Not matched',
  alreadyInHistory: 'Already in history',
  // Several source rows describing one watch, e.g. Netflix listing each
  // episode of a series watched on the same night.
  mergedIntoOneEntry: 'Merged into one entry',
  partialFailure: (n) => `${n} title${n !== 1 ? 's' : ''} could not be saved. Nothing already in your history was changed, so you can safely run the import again.`,
  // Shown when the existing-history read fails. The import stops rather than
  // continuing, because planning against a partial history would overwrite
  // ratings and notes on titles it could not see.
  couldNotReadHistory: 'We could not check what is already in your history, so the import stopped. Nothing was changed. Please try again.',
  newBadge: 'New',
  haveBadge: 'Have',
  importing: 'Importing…',
  nothingNew: 'Nothing new',
  importArrow: 'Import →',
};
