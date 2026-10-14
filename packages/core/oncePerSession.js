// A view that should count once per JS session (one tab on web, one app
// process on mobile). Remounts and tab switches must not inflate it.

const seen = new Set();

/**
 * Run `fire` the first time `key` is seen in this session.
 *
 * @param {string} key
 * @param {() => void} fire
 * @returns {boolean} true when `fire` ran
 */
export function oncePerSession(key, fire) {
  if (!key || seen.has(key)) return false;
  seen.add(key);
  fire();
  return true;
}
