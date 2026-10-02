/**
 * Whole-season-ready alerts (Premium): the toggle on a show and the list in
 * Settings. Following people is worded in ./people.js. Notification rows are worded in ./notifications.js.
 *
 * Episode release notifications are a separate, Free feature (see
 * plansPage.js freeFeatures.episodeAlerts); nothing here is about episodes.
 */
export const PREMIUM_ALERTS = Object.freeze({
  season: Object.freeze({
    title: 'Whole-season alerts',
    hint: 'Hear when every episode of a finished season is on your services.',
    needsServices: 'Choose your services in Settings so Plot knows where to look.',
    off: 'Get alert',
    on: 'Alert on',
    offLabel: 'Get a whole-season alert for this show',
    onLabel: 'Stop whole-season alerts for this show',
  }),
  settings: Object.freeze({
    shows: 'Shows with whole-season alerts',
    remove: 'Remove',
    /** @param {string} name */
    removeLabel: (name) => `Remove alerts for ${name}`,
    lapsed: 'Alerts are paused while you are on Free. Your choices are kept.',
  }),
  error: 'Couldn’t update this alert. Try again.',
});
