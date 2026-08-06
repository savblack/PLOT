// Strip credential-bearing parameters out of a URL before it can be captured.
//
// Why this exists: sign-ins land on /auth/callback carrying a credential in the
// URL. Under the old implicit flow that was the whole session in the fragment
// (`#access_token=…&refresh_token=…`), and PostHog wrote it into $current_url
// verbatim — a recording stored a live refresh token, exchangeable for new
// sessions with only the public anon key.
//
// That is already closed at the source: the web client moved to PKCE and
// disable_capture_url_hashes is on, so the callback now carries a single-use
// `?code=…` (OAuth) or `?token_hash=…` (email links) and no fragment is
// captured. This is the layer under that — those query params are still
// credentials, briefly, and neither belongs in analytics or browser history.
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
