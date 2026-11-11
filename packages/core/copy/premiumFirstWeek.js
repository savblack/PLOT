// "Your first week of Premium": the checklist on Home after an upgrade
// (@plot/core/premiumFirstWeek.js). Shared with mobile.

export const PREMIUM_FIRST_WEEK = {
  title: 'Your first week of Premium',
  count: (done, total) => `${done} of ${total}`,
  progressLabel: (done, total) => `${done} of ${total} done`,
  expand: 'Expand your first week of Premium',
  collapse: 'Collapse your first week of Premium',
  done: 'Done',
  notDone: 'Not done',
  ready: 'You have tried it all',
  readyBody: 'Everything in Premium is yours. Enjoy the show.',
  nice: 'Nice',

  steps: {
    theme: { title: 'Pick a theme', sub: 'Give Plot your own colors.', doneSub: 'Your theme is on', cta: 'Choose' },
    people: { title: 'Follow an actor or director', sub: 'See what they have coming next.', doneSub: (n) => `Following ${n} ${n === 1 ? 'person' : 'people'}`, cta: 'Find people' },
    together: { title: 'Invite someone to watch together', sub: 'Find something you both want to see.', doneSub: 'Invitation sent', cta: 'Invite' },
    calendar: { title: 'Subscribe your calendar', sub: 'New episodes, in your own calendar.', doneSub: 'Your calendar feed is on', cta: 'Set up' },
    smartList: { title: 'Make a smart list', sub: 'Set a few rules. It finds the titles.', doneSub: (n) => `${n} smart ${n === 1 ? 'list' : 'lists'}`, cta: 'Create' },
  },
};
