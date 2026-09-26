/**
 * Where to send someone after they sign in, when they were bounced to /login
 * from a page they were trying to open (a taste comparison link, /compare,
 * any protected route).
 *
 * Kept in sessionStorage rather than the URL so it survives the password,
 * magic-link and OAuth round trips alike, and expires so a stale path from an
 * abandoned sign-in never hijacks a later one. Only same-app rooted paths are
 * accepted (safeAppReturnPath), so this can never become an open redirect.
 */
import { safeAppReturnPath } from './premiumExplore.js';

const KEY = 'plot_auth_return';
const MAX_AGE_MS = 30 * 60 * 1000;

function session(storage) {
  if (storage) return storage;
  try { return typeof window !== 'undefined' ? window.sessionStorage : null; } catch { return null; }
}

/** Paths that are part of signing in themselves; returning to them loops. */
const AUTH_PATHS = ['/login', '/signup', '/logout', '/auth/', '/onboarding', '/reset-password'];

/**
 * @param {string | null | undefined} path e.g. `${location.pathname}${location.search}`
 * @param {{ storage?: Storage, now?: number }} [opts]
 */
export function rememberReturnPath(path, { storage, now = Date.now() } = {}) {
  const safe = safeAppReturnPath(path, null);
  const store = session(storage);
  if (!safe || !store || AUTH_PATHS.some(p => safe.startsWith(p))) return;
  try { store.setItem(KEY, JSON.stringify({ path: safe, at: now })); } catch { /* storage blocked */ }
}

/**
 * Read and clear the remembered path.
 * @param {string} fallback where to go when nothing (valid) is remembered
 * @param {{ storage?: Storage, now?: number }} [opts]
 */
export function takeReturnPath(fallback, { storage, now = Date.now() } = {}) {
  const store = session(storage);
  if (!store) return fallback;
  let saved;
  try {
    saved = JSON.parse(store.getItem(KEY) || 'null');
    store.removeItem(KEY);
  } catch { return fallback; }
  if (!saved || typeof saved.at !== 'number' || now - saved.at > MAX_AGE_MS) return fallback;
  return safeAppReturnPath(saved.path, fallback);
}
