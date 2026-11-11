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

  // Each step's title is the one thing to do; the line under it is what the
  // person gets for doing it. A title that only names the benefit ("Never
  // miss their next release") left people not knowing what to press.
  steps: {
    theme: { title: 'Pick a favorite theme', sub: 'Make Plot look like yours.', doneSub: 'Your theme is on', cta: 'Pick a theme' },
    people: { title: 'Follow a favorite actor or director', sub: 'Never miss their next release.', doneSub: (n) => `Following ${n} ${n === 1 ? 'person' : 'people'}`, cta: 'Find people' },
    together: { title: 'Invite someone to watch together', sub: 'Agree on what to watch, faster.', doneSub: 'Invitation sent', cta: 'Invite' },
    calendar: { title: 'Subscribe to your calendar', sub: 'See release dates where you plan.', doneSub: 'Your calendar is subscribed', cta: 'Subscribe' },
    smartList: { title: 'Make a smart list', sub: 'Set a few rules and it fills itself.', doneSub: (n) => `${n} smart ${n === 1 ? 'list' : 'lists'}`, cta: 'Make a list' },
  },
};
