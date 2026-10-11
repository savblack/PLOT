/**
 * The page opened from the Unsubscribe link in the weekly digest email
 * (/newsletter/unsubscribe). The digest is marketing mail with its own consent,
 * separate from streaming alert emails (copy/alertEmail.js): different token,
 * different table, and this page says so by naming only the digest.
 */
export const NEWSLETTER_UNSUBSCRIBE = Object.freeze({
  title: 'Stop the weekly digest?',
  body: 'You will not get the plot digest email any more. Your account and in-app alerts are not affected.',
  button: 'Unsubscribe',
  working: 'Unsubscribing',
  doneTitle: 'Unsubscribed',
  doneBody: 'You will not receive the plot digest again.',
  invalidTitle: 'This link is not valid',
  invalidBody: 'It may be incomplete or out of date. Every digest email has its own unsubscribe link.',
  errorTitle: 'We couldn’t do that',
  errorBody: 'Please check your connection and try again.',
  home: 'Go to plot',
});
