/**
 * Product-level switches shared by web and mobile.
 *
 * FAVOURITES_ENABLED: Favourites (the heart) overlapped too much with the
 * watchlist, so the UI is hidden for now. The hook, tables, analytics and
 * public-profile queries are all kept: flip this to true to bring it back.
 */
export const FAVOURITES_ENABLED = false;

/**
 * ALERT_EMAIL_ENABLED: the Premium option to also get streaming alerts by email
 * (the "Also email me" row in Settings > Viewing, and its upgrade sheet). The
 * server side ships dormant (alert-email-delivery, alert-email-unsubscribe,
 * notification_deliveries): nothing is sent unless the ALERT_EMAIL_DELIVER
 * function secret is "true". This keeps the Settings row hidden until delivery
 * is switched on, so nobody is offered an email that will not arrive. Flip it to
 * true in the same change that sets the secret.
 */
export const ALERT_EMAIL_ENABLED = false;
