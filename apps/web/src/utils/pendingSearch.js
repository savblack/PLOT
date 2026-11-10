import { readStorage, writeStorage, removeStorage } from './storage.js';

/**
 * A "pending search" is a title someone typed into the theplot.tv homepage
 * search bar before they had an account. The homepage sends them to
 * /signup?q=<title>; the sign-up page stashes the title here so it survives
 * the signup round trip (including the email-confirmation hop, as long as it
 * lands in the same browser). Once the person reaches the app shell, App opens
 * the search palette with the title already typed.
 *
 * Web only: the marketing site hands off to the web app, never to mobile, so
 * there is no mobile counterpart to keep in step.
 */
const KEY = 'plot_pending_search';

// A search typed long ago should not pop open days later.
const TTL_MS = 24 * 60 * 60 * 1000; // 24h

// The homepage field allows 100 characters; anything longer was not typed there.
export const MAX_PENDING_SEARCH_LENGTH = 100;

/** Trim and collapse whitespace. Returns null for an empty or non-string value. */
export function normalizePendingSearch(value) {
  if (typeof value !== 'string') return null;
  const query = value.replace(/\s+/g, ' ').trim().slice(0, MAX_PENDING_SEARCH_LENGTH).trim();
  return query || null;
}

/** Persist a typed title. Returns the normalised query, or null if there was nothing to keep. */
export function writePendingSearch(value) {
  const query = normalizePendingSearch(value);
  if (!query) return null;
  writeStorage(KEY, JSON.stringify({ query, ts: Date.now() }));
  return query;
}

/**
 * Read and clear the pending search in one step, so it opens at most once.
 * Returns the query, or null when there is none or it has expired.
 */
export function takePendingSearch(now = Date.now()) {
  const raw = readStorage(KEY);
  if (!raw) return null;
  removeStorage(KEY);
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || now - parsed.ts > TTL_MS || now < parsed.ts) return null;
    return normalizePendingSearch(parsed.query);
  } catch {
    return null;
  }
}
