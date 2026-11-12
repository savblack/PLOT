// The empty-library nudge (core/activationNudge.js), web and mobile. Any
// number of titles counts: no target, no progress count.
export const ACTIVATION_NUDGE = {
  title: 'Add your first show or movie',
  body: 'Even one is a good start. Add something you’re watching, have seen or want to see, and Plot starts working for you.',
  add: 'Find a title',
  importTitle: 'Import your watch history',
  importBody: 'Already tracking somewhere else? Bring it over.',
  importFrom: (name) => `Import from ${name}`,
};
