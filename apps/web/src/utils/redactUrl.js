// Strip credential-bearing parameters out of a URL before it can be captured.
//
// Why this exists: OAuth / magic-link sign-ins return to /auth/callback with the
// Supabase session in the URL *fragment* — `#access_token=…&refresh_token=…` for
// the implicit flow, and a single-use `?code=…` / `?token_hash=…` for PKCE/OTP.
// Those land in the address bar, and PostHog captures the URL both as the
// `$current_url` on events and as the URL shown in the session-replay player. A
// recording that stored the raw callback URL therefore exposed live access +
// refresh tokens to anyone who could view the replay (P1 credential leak).
//
// This redacts the *value* of any known credential param wherever it appears —
// query string OR fragment — while leaving the rest of the URL (path, benign
// params) intact so analytics and replays stay useful. Pure string in / string
// out so it's trivially unit-testable and reusable from both the PostHog masking
// hooks (main.jsx) and the callback page's address-bar cleanup.

const SENSITIVE_PARAMS = [
  'access_token',
  'refresh_token',
  'provider_token',
  'provider_refresh_token',
  'id_token',
  'token',
  'token_hash',
  'code',
];

// Match `<param>=<value>` up to the next `&` (param separator in both query and
// fragment). `\b` anchors on a word boundary so we don't clip a longer name that
// merely ends in one of these (e.g. `my_token`). Case-insensitive + global.
const SENSITIVE_RE = new RegExp(`\\b(${SENSITIVE_PARAMS.join('|')})=[^&]*`, 'gi');

export function redactSensitiveUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  return url.replace(SENSITIVE_RE, '$1=redacted');
}
