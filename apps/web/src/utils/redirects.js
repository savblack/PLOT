import { canUseDOM } from './storage.js';

const env = import.meta.env ?? {};
const APP_BASE_URL = env.VITE_AUTH_REDIRECT_BASE_URL || env.VITE_APP_ORIGIN || null;

function browserOrigin() {
  return canUseDOM() ? window.location.origin : null;
}

export function getAppUrl(path = '/', baseUrl = APP_BASE_URL || browserOrigin()) {
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
