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

  // Each step leads with what the person gets, then the one thing to do.
  steps: {
    theme: { title: 'Make Plot yours', sub: 'Pick a favorite theme.', doneSub: 'Your theme is on', cta: 'Pick a theme' },
    people: { title: 'Never miss their next release', sub: 'Follow your favorite actor or director.', doneSub: (n) => `Following ${n} ${n === 1 ? 'person' : 'people'}`, cta: 'Find people' },
    together: { title: 'Agree on what to watch', sub: 'Invite someone to watch together.', doneSub: 'Invitation sent', cta: 'Invite' },
    calendar: { title: 'Release dates where you plan', sub: 'Subscribe to your calendar.', doneSub: 'Your calendar is subscribed', cta: 'Subscribe' },
    smartList: { title: 'Lists that fill themselves', sub: 'Make a smart list from a few rules.', doneSub: (n) => `${n} smart ${n === 1 ? 'list' : 'lists'}`, cta: 'Make a list' },
  },
};
