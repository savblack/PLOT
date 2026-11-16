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

export function getSimklCallbackUrl() {
  return getAppUrl('/auth/simkl');
}

export function createSimklState(returnTo = '/import?source=simkl') {
  const state = crypto.randomUUID();
  sessionStorage.setItem('plot_simkl_oauth_state', state);
  sessionStorage.setItem('plot_simkl_oauth_return_to', returnTo);
  return state;
}

export function consumeSimklState(state) {
  const expected = sessionStorage.getItem('plot_simkl_oauth_state');
  sessionStorage.removeItem('plot_simkl_oauth_state');
  return Boolean(expected && state && expected === state);
}

export function consumeSimklReturnTo() {
  const value = sessionStorage.getItem('plot_simkl_oauth_return_to');
  sessionStorage.removeItem('plot_simkl_oauth_return_to');
  return value?.startsWith('/') ? value : '/import?source=simkl';
}

// The Trakt callback page posts this to the window that opened it (onboarding
// connects in a popup so the step's picks survive).
export const TRAKT_POPUP_MESSAGE = 'plot:trakt-connected';

export function createTraktState(returnTo = '/settings') {
  const state = crypto.randomUUID();
  sessionStorage.setItem('plot_trakt_oauth_state', state);
  sessionStorage.setItem('plot_trakt_oauth_return_to', returnTo);
  return state;
}

export function consumeTraktState(state) {
  const expected = sessionStorage.getItem('plot_trakt_oauth_state');
  sessionStorage.removeItem('plot_trakt_oauth_state');
  return Boolean(expected && state && expected === state);
}

export function consumeTraktReturnTo() {
  const returnTo = sessionStorage.getItem('plot_trakt_oauth_return_to');
  sessionStorage.removeItem('plot_trakt_oauth_return_to');
  return returnTo?.startsWith('/') ? returnTo : '/settings';
}

// Where a connect error page (Trakt, Simkl) offers to go back to: the page
// the connect was started from, so someone part-way through setup is not
// sent to Settings or Import. Only the three pages that start a connect are
// accepted; anything else (including a missing address) gets the service's
// own fallback.
const CONNECT_ERROR_RETURNS = [['/onboarding', 'setup'], ['/import', 'import'], ['/settings', 'settings']];

/**
 * @typedef {{ href: string, place: 'setup' | 'import' | 'settings' }} ConnectErrorReturn
 */

/**
 * @param {string | null | undefined} returnTo the stored return address
 * @param {ConnectErrorReturn} fallback
 * @returns {ConnectErrorReturn}
 */
function connectErrorReturn(returnTo, fallback) {
  const path = typeof returnTo === 'string' ? returnTo : '';
  for (const [base, place] of CONNECT_ERROR_RETURNS) {
    if (path === base || path.startsWith(`${base}?`)) return { href: path, place: /** @type {ConnectErrorReturn['place']} */ (place) };
  }
  return fallback;
}

/**
 * Trakt connects started from Settings before setup and Import offered it,
 * so Settings is its fallback.
 * @param {string | null | undefined} returnTo the stored return address
 * @returns {ConnectErrorReturn}
 */
export function traktErrorReturn(returnTo) {
  return connectErrorReturn(returnTo, { href: '/settings', place: 'settings' });
}

/**
 * Simkl only connects from an import, so Import is its fallback.
 * @param {string | null | undefined} returnTo the stored return address
 * @returns {ConnectErrorReturn}
 */
export function simklErrorReturn(returnTo) {
  return connectErrorReturn(returnTo, { href: '/import?source=simkl', place: 'import' });
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
