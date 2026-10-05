/**
 * Streaming alerts on watchlist films (Free, in the app): the card on a film
 * that is on your watchlist, and the controls in Settings. Notification rows
 * are worded in ./notifications.js (STREAMING_ARRIVAL_NOTIFICATION).
 *
 * Nothing to switch on: the watchlist is the opt-in. A person can mute one film
 * or turn the whole thing off. Push, email and phone notifications are a later
 * Premium option (see plansPage.js) and nothing here promises them.
 */
export const STREAMING_ALERTS = Object.freeze({
  card: Object.freeze({
    title: 'Streaming alerts',
    hint: 'We’ll tell you in the app when this film lands on one of your services, or becomes free to watch.',
    hintNoServices: 'Choose your services in Settings to hear when it lands on one of yours. We’ll still tell you if it becomes free to watch.',
    muted: 'You won’t get streaming alerts for this film.',
    switchedOff: 'Streaming alerts are off for your watchlist.',
    // A toggle: pressed means this film's alerts are on, and pressing mutes it.
    on: 'Alerts on',
    off: 'Alerts off',
    muteLabel: 'Mute streaming alerts for this film',
    unmuteLabel: 'Turn streaming alerts back on for this film',
    // The global switch is off: one tap puts it back, so nobody has to hunt for Settings.
    turnOnAll: 'Turn on',
    turnOnAllLabel: 'Turn streaming alerts back on for your watchlist',
  }),
  settings: Object.freeze({
    groupTitle: 'Streaming alerts',
    switchLabel: 'Alerts for my watchlist',
    switchHint: 'In the app, when a film on your watchlist lands on one of your services or becomes free to watch.',
    muted: 'Muted films',
    unmute: 'Turn on',
    /** @param {string} name */
    unmuteLabel: (name) => `Turn streaming alerts back on for ${name}`,
  }),
  /** A quiet footer on the notifications page, like PEOPLE.notificationsFooter. */
  notificationsFooter: Object.freeze({
    body: 'Alerts for films on your watchlist.',
    link: 'Manage alerts',
  }),
  error: 'Couldn’t update this alert. Try again.',
});
