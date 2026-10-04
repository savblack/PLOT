/**
 * Premium alerts toggled on a title: whole-season-ready (a show) and streaming
 * (a film), and their list in Settings. Following people is worded in ./people.js. Notification rows are worded in ./notifications.js.
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
  streaming: Object.freeze({
    title: 'Streaming alerts',
    hint: 'Hear when this film lands on one of your services, or becomes free to watch.',
    needsServices: 'Choose your services in Settings so Plot knows where to look. Free arrivals still reach you.',
    off: 'Get alert',
    on: 'Alert on',
    offLabel: 'Get a streaming alert for this film',
    onLabel: 'Stop streaming alerts for this film',
  }),
  settings: Object.freeze({
    shows: 'Shows with whole-season alerts',
    films: 'Films with streaming alerts',
    remove: 'Remove',
    /** @param {string} name */
    removeLabel: (name) => `Remove alerts for ${name}`,
    lapsed: 'Alerts are paused while you are on Free. Your choices are kept.',
  }),
  error: 'Couldn’t update this alert. Try again.',
});
