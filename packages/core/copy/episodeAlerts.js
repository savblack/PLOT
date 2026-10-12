// The title panel's Episode alerts card (TV shows someone follows): the
// per-show switch for new-episode notifications and, while it is on, the next
// episode with Add to calendar. Shared so mobile says the same once it renders
// the card. "Subscribe to Calendar" and "Download .ics" are the Settings
// strings (settingsView.js calendarFeed), reused rather than retyped.

export const EPISODE_ALERTS = {
  title: 'Episode alerts',
  hintOn: 'New episodes will show up in your Notifications.',
  hintOff: 'Turned off for this show.',
  turnOn: (title) => `Turn on episode alerts for ${title}`,
  turnOff: (title) => `Turn off episode alerts for ${title}`,
  toastOn: (title) => `You’ll get notified when new ${title} episodes are out.`,
  toastOff: (title) => `Episode alerts off for ${title}.`,
  error: 'Couldn’t update episode alerts. Try again.',
  // After the first forward episode tick. Once per account on this device.
  // Alerts themselves are free. Add to calendar is the Premium part.
  promptQuestion: 'Get told when the next episode drops?',
  promptAction: 'Turn on alerts',

  nextEpisode: 'Next episode',
  noNextEpisode: 'No next episode announced yet',
  seasonPremiere: (season) => `Season ${season} premiere`,
  episode: (season, episode) => `S${season} · E${episode}`,

  addToCalendar: 'Add to calendar',
  subscribeHint: 'Every show on your watchlist, kept up to date in Google or Apple Calendar',
  downloadHint: 'A one-time snapshot of the dates announced so far',
  linkCopied: 'Calendar link copied. Paste it into Google or Apple Calendar.',
  nothingToDownload: 'No dates announced for this show yet.',
};
