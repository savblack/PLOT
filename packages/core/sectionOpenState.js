// How a collapsible section's open/closed state is persisted.
//
// The storage *mechanism* differs per platform — web reads localStorage
// synchronously, mobile reads AsyncStorage asynchronously — but the key format
// and the encoding must not. Both live here so a section id means the same
// thing on both platforms, and so neither side can quietly change '1'/'0' to
// 'true'/'false' and orphan every stored preference.
//
// Callers: apps/web/src/utils/sectionOpenState.js (localStorage) and
// apps/mobile/lib/sectionOpenState.ts (AsyncStorage).

/**
 * @param {string} id Section id, e.g. 'watching' or 'history-2026-3'.
 * @returns {string}
 */
export function sectionStorageKey(id) {
  return `plot.section.${id}`;
}

/**
 * Decode a stored value. Anything unrecognised (including null, which is what
 * both stores return for a key that was never written) falls back, so a new
 * section appears in its default state rather than collapsed.
 *
 * @param {string | null | undefined} value
 * @param {boolean} [fallback]
 * @returns {boolean}
 */
export function parseSectionOpen(value, fallback = true) {
  if (value === '1') return true;
  if (value === '0') return false;
  return fallback;
}

/**
 * @param {boolean} open
 * @returns {'1' | '0'}
 */
export function serialiseSectionOpen(open) {
  return open ? '1' : '0';
}
