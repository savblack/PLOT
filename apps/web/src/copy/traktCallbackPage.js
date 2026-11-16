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

// The link on a connect error page, by where the connect was started. The
// Simkl error page shows the same three links, so it reads them from here.
export const CONNECT_BACK_LABELS = {
  setup: TRAKT_CALLBACK_PAGE.backToSetup,
  import: TRAKT_CALLBACK_PAGE.backToImport,
  settings: TRAKT_CALLBACK_PAGE.backToSettings,
};
