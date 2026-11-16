export const TRAKT_CALLBACK_PAGE = {
  noAuthCode: 'No authorization code received from Trakt.',
  invalidOrExpired: 'This Trakt connection request is invalid or has expired. Please try again.',
  notConfigured: 'Trakt sync is not configured.',
  couldNotConnect: (message) => `Could not connect Trakt: ${message}`,
  backToSettings: 'Back to settings',
  backToSetup: 'Back to setup',
  backToImport: 'Back to import',
  closeWindow: 'Close this window',
  connecting: 'Connecting Trakt…',
};
