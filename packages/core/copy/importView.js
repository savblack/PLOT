// Shared copy: used by the web app and mobile's ImportHistoryModal.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/importView.js re-exports it so src/copy stays the single
// place the web app and the Storybook Content page look for copy.

export const IMPORT_VIEW = {
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
