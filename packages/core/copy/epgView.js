// Shared copy: used by the web app and mobile's app/(app)/guide.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/epgView.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const EPG_VIEW = {
  removeReminder: 'Remove reminder',
  addToCalendar: 'Add to Calendar',
  available: 'Available',
  onNow: 'On Now',
  upNext: 'Up Next',
  later: 'Later',
};
