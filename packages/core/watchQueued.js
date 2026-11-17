// A save made outside the title panel (a Discover card, a search result) tells
// the app shell so it can open that title's panel in the same session, where the
// foot bar already asks "Watched it?". Core never opens UI; it only notifies.
// Both apps subscribe: web in App.jsx, mobile in MediaPanelContext.tsx.

/** Sources whose save should leave the person on the surface they are using. */
export const CALENDAR_SUGGESTIONS_SOURCE = 'calendar_suggestions';
export const QUICK_ADD_SOURCE = 'quick_add';

/** @param {string | null | undefined} source */
export function shouldOpenPendingWatchPanel(source) {
  return source !== CALENDAR_SUGGESTIONS_SOURCE && source !== QUICK_ADD_SOURCE;
}

/** @type {Set<(payload: { tmdb_id: number, media_type: string, source?: string }) => void>} */
const watchQueuedListeners = new Set();

/**
 * @param {(payload: { tmdb_id: number, media_type: string, source?: string }) => void} fn
 * @returns {() => void}
 */
export function onPendingWatchQueued(fn) {
  watchQueuedListeners.add(fn);
  return () => { watchQueuedListeners.delete(fn); };
}

/**
 * @param {{ tmdb_id: number, media_type: string, source?: string }} payload
 */
export function notifyPendingWatchQueued(payload) {
  for (const fn of watchQueuedListeners) {
    try { fn(payload); } catch { /* listener errors must not break saves */ }
  }
}
