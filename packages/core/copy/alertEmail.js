/**
 * Premium email alerts, as the person sees them in Settings > Viewing: the
 * "Also email me" row under the in-app streaming alerts switch. The wording of
 * the email itself lives with the sender (supabase/functions/_shared/alertEmail.js),
 * because Edge Functions cannot import from here.
 *
 * Kept apart from copy/streamingAlerts.js on purpose: that file is the Free,
 * in-app alert, and a test pins that it never mentions email or Premium.
 *
 * The Settings row is shown only while ALERT_EMAIL_ENABLED (features.js) is
 * true. The unsubscribe page is always available: withdrawing consent is never
 * gated.
 */
export const ALERT_EMAIL = Object.freeze({
  settings: Object.freeze({
    label: 'Also email me',
    hint: 'Premium. Get these alerts in your inbox too. Every email has an unsubscribe link.',
    // The in-app switch is off, so there is nothing to email: email follows it.
    needsAlerts: 'Email follows your alerts. Turn on alerts for my watchlist first.',
    error: 'Couldn’t update this. Try again.',
  }),
  /** The page opened from the Unsubscribe link in an email (/email/unsubscribe). */
  unsubscribe: Object.freeze({
    title: 'Stop streaming alert emails?',
    body: 'You will still get alerts in the app.',
    button: 'Unsubscribe',
    working: 'Unsubscribing',
    doneTitle: 'Unsubscribed',
    doneBody: 'You will not get streaming alert emails from plot. Alerts still arrive in the app, and you can turn emails back on any time in Settings.',
    invalidTitle: 'This link is not valid',
    invalidBody: 'It may be incomplete or out of date. You can turn email alerts off in Settings.',
    errorTitle: 'We couldn’t do that',
    errorBody: 'Please try again, or turn email alerts off in Settings.',
    settings: 'Open Settings',
  }),
});
