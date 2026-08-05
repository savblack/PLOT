// Shared copy: used by the web app and mobile's app/(app)/calendar.tsx.
// Lives in @plot/core/copy so the two platforms can't drift word by word;
// apps/web/src/copy/calendarView.js re-exports it so src/copy stays the single place
// the web app and the Storybook Content page look for copy.

export const CALENDAR_VIEW = {
  eventLabel: {
    episode: 'Episode',
    streaming: 'Streaming',
    reminder: 'Reminder',
  },
};
