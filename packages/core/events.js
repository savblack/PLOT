// Minimal platform-agnostic pub/sub used by shared hooks for cross-component
// signalling (e.g. "history changed"). Replaces direct `window` event usage so
// the same hook works on web and React Native (which has no `window`).

/* Emitted whenever a history row is written or removed. It lives here, with
   the bus, rather than in useHistory: the modules that *write* history have to
   emit it, and they shouldn't have to import a hook to do so. */
export const HISTORY_CHANGED_EVENT = 'plot:history-changed';

const listeners = new Map(); // event name -> Set<fn>

/** Subscribe to an event. Returns an unsubscribe function. */
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => off(event, fn);
}

/** Unsubscribe a previously registered listener. */
export function off(event, fn) {
  listeners.get(event)?.delete(fn);
}

/** Emit an event to all current listeners. */
export function emit(event, payload) {
  listeners.get(event)?.forEach((fn) => {
    try { fn(payload); } catch (err) { console.error(`[events] listener for "${event}" threw`, err); }
  });
}
