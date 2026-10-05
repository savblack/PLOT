/**
 * Premium email alerts, as the person sees them in Settings > Viewing: the
 * "Also email me" row under the in-app streaming alerts switch. The wording of
 * the email itself lives with the sender (supabase/functions/_shared/alertEmail.js),
 * because Edge Functions cannot import from here.
 *
 * Kept apart from copy/streamingAlerts.js on purpose: that file is the Free,
 * in-app alert, and a test pins that it never mentions email or Premium.
 *
 * Shown only while ALERT_EMAIL_ENABLED (features.js) is true.
 */
export const ALERT_EMAIL = Object.freeze({
  settings: Object.freeze({
    label: 'Also email me',
    hint: 'Premium. Get these alerts in your inbox too. Every email has an unsubscribe link.',
    // The in-app switch is off, so there is nothing to email: email follows it.
    needsAlerts: 'Email follows your alerts. Turn on alerts for my watchlist first.',
    error: 'Couldn’t update this. Try again.',
  }),
});
