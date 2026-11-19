/**
 * The page opened from the link in the digest's confirmation email
 * (/newsletter/confirm). A website signup only starts the digest once this
 * button is pressed (double opt-in, supabase/functions/_shared/newsletterConfirm.ts).
 */
export const NEWSLETTER_CONFIRM = Object.freeze({
  title: 'Confirm your subscription',
  body: 'Press the button to start getting the Plot Digest at this address.',
  button: 'Confirm',
  working: 'Confirming',
  doneTitle: 'You’re subscribed',
  doneBody: 'The next Plot Digest will land in your inbox. Every issue has an unsubscribe link.',
  invalidTitle: 'This link is not valid',
  invalidBody: 'It may already have been used, or it may be incomplete. If you are not getting the digest, subscribe again on theplot.tv.',
  expiredTitle: 'This link has expired',
  expiredBody: 'Subscribe again on theplot.tv and we will send you a new one.',
  errorTitle: 'We couldn’t do that',
  errorBody: 'Please check your connection and try again.',
  home: 'Go to Plot',
});
