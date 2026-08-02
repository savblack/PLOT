import { readStorage, writeStorage, removeStorage } from './storage.js';

/**
 * Cached copy of the last-fetched profile, keyed by user id.
 *
 * supabase.auth.getSession() resolves from its own localStorage cache almost
 * immediately, but the profile row is a real network round-trip — on a
 * returning visit that's otherwise unavoidable dead time behind a boot
 * loader (both App.jsx's own gate and ProtectedRoute's, which wraps it and
 * would otherwise block App from mounting at all). Stashing the last-fetched
 * profile lets both render optimistically with last-known-good data while
 * the real fetch runs in the background and corrects it (or clears it, if
 * the session turns out to be gone) when it lands.
 */
const PROFILE_CACHE_KEY = 'plot-cached-profile';

export function readCachedSession() {
  try {
    const parsed = JSON.parse(readStorage(PROFILE_CACHE_KEY));
    return parsed?.userId ? parsed : null;
  } catch {
    return null;
  }
}

export function writeCachedSession(userId, profile) {
  writeStorage(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile }));
}

export function clearCachedSession() {
  removeStorage(PROFILE_CACHE_KEY);
}
