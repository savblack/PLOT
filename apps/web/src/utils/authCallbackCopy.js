// Which message the /auth/callback error screen shows for a failed sign-in.
// Kept out of the page component so it is unit-testable in Node.
import { authErrorReason } from '@plot/core/authErrors.js';
import { AUTH_CALLBACK_PAGE } from '../copy/authCallbackPage.js';

// PKCE exchange failures come from an OAuth (or PKCE email) redirect that
// could not be finished in this browser: the verifier lives in the tab's
// origin storage, so a callback opened in another browser, profile, or in-app
// webview has nothing to exchange with. Telling those people their "link has
// expired" sent them looking for an email that never existed.
const OAUTH_UNFINISHED_REASONS = new Set([
  'pkce_verifier_missing',
  'pkce_verifier_mismatch',
  'flow_state_expired',
]);

/**
 * @param {string} message  resolveAuthCallback's error (or a thrown message).
 * @returns {string} user-facing copy
 */
export function callbackErrorCopy(message) {
  if (message === 'no-session') return AUTH_CALLBACK_PAGE.couldNotFinishSignIn;
  if (OAUTH_UNFINISHED_REASONS.has(authErrorReason(message))) return AUTH_CALLBACK_PAGE.oauthDidNotFinish;
  return AUTH_CALLBACK_PAGE.linkExpiredOrInvalid;
}
