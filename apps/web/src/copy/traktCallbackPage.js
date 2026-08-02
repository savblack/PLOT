export const TRAKT_CALLBACK_PAGE = {
  noAuthCode: 'No authorization code received from Trakt.',
  invalidOrExpired: 'This Trakt connection request is invalid or has expired. Please try again from Settings.',
  notConfigured: 'Trakt sync is not configured.',
  couldNotConnect: (message) => `Could not connect Trakt: ${message}`,
  backToSettings: 'Back to settings',
  connecting: 'Connecting Trakt…',
};
