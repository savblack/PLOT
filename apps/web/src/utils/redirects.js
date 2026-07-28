import { canUseDOM } from './storage.js';
import { isPreviewDeployment } from './previewDeployment.js';

const env = import.meta.env ?? {};
const APP_BASE_URL = env.VITE_AUTH_REDIRECT_BASE_URL || env.VITE_APP_ORIGIN || null;

function browserOrigin() {
  return canUseDOM() ? window.location.origin : null;
}

// On localhost/preview hosts, always send auth redirects back to wherever the
// user actually is — never a configured production override. Otherwise a
// build-time env var (or one that leaked into a Cloudflare Pages Preview
// environment) would silently redirect preview/local logins to production.
function defaultBaseUrl() {
  if (canUseDOM() && isPreviewDeployment()) return browserOrigin();
  return APP_BASE_URL || browserOrigin();
}

export function getAppUrl(path = '/', baseUrl = defaultBaseUrl()) {
  if (/^[a-z][a-z\d+.-]*:/i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!baseUrl) return normalizedPath;

  return `${String(baseUrl).replace(/\/+$/, '')}${normalizedPath}`;
}

export function getAuthCallbackUrl() {
  return getAppUrl('/auth/callback');
}

export function getTraktCallbackUrl() {
  return getAppUrl('/auth/trakt');
}

export function createTraktState() {
  const state = crypto.randomUUID();
  sessionStorage.setItem('plot_trakt_oauth_state', state);
  return state;
}

export function consumeTraktState(state) {
  const expected = sessionStorage.getItem('plot_trakt_oauth_state');
  sessionStorage.removeItem('plot_trakt_oauth_state');
  return Boolean(expected && state && expected === state);
}

export function buildTraktAuthorizeUrl(clientId, state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: getTraktCallbackUrl(),
    state,
  });

  return `https://trakt.tv/oauth/authorize?${params}`;
}

export function redirectToExternal(url) {
  if (!canUseDOM()) return false;
  window.location.assign(url);
  return true;
}
