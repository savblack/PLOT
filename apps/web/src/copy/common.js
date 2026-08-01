// Shared UI chrome copy used across multiple surfaces (buttons, generic
// actions). Add an entry here when the same word/phrase is repeated in three
// or more components; copy used in only one place stays local to that file's
// copy module (see src/copy/<surface>.js) until it's reused elsewhere.
//
// None of these vary by region (see src/utils/spelling.js for the words that
// do) — they're identical in every English dialect PLOT supports.

export const COMMON = {
  cancel: 'Cancel',
  save: 'Save',
  close: 'Close',
  edit: 'Edit',
  delete: 'Delete',
  done: 'Done',
  confirm: 'Confirm',
  add: 'Add',
  remove: 'Remove',
  back: 'Back',
  next: 'Next',
  continue: 'Continue',
  submit: 'Submit',
  share: 'Share',
  copied: 'Copied!',
  like: 'Like',
  unlike: 'Unlike',
  someone: 'Someone', // fallback display name when a user has no name/username set
  addComment: 'Add a comment',
  genericError: 'Something went wrong. Please try again.',
  select: 'Select',
  deselect: 'Deselect',
  sending: 'Sending…',
  saving: 'Saving…',
  send: 'Send',
  turnOn: 'Turn on',
  turnOff: 'Turn off',
  none: 'None',
  notSet: 'Not set',
  syncing: 'Syncing…',
  loading: 'Loading…',
};
