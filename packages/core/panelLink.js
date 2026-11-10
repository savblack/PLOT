// The address of an open panel (a title, a collection or a person), as one query
// parameter on whatever page is behind it: `/home?panel=movie-438631`.
//
// Before this the panel lived only in React state, so the browser's Back
// button changed the page behind it and left the panel open, a title could
// not be linked to, and opening a film from a collection had no way back
// (design audit, 10 Nov 2026, pick 1.1 A: panels for things, pages for
// places). The value is `<type>-<tmdb id>`. Ids only ever come from a TMDB
// response or a link someone was given; nothing here guesses one.
//
// Pure string logic so it can be tested and so mobile can read the same
// links if it ever opens them.

export const PANEL_PARAM = 'panel';
const PANEL_TYPES = ['movie', 'tv', 'collection', 'person'];

/**
 * @typedef {{ id: number, type: 'movie' | 'tv' | 'collection' | 'person' }} PanelTarget
 */

/** @param {PanelTarget} target */
export function panelParamValue(target) {
  return `${target.type}-${target.id}`;
}

/**
 * The panel a query string points at, or null when it has none or the value
 * is not one this app writes.
 *
 * @param {string} search  e.g. "?type=tv&panel=movie-438631"
 * @returns {PanelTarget | null}
 */
export function parsePanelParam(search) {
  const value = new URLSearchParams(search || '').get(PANEL_PARAM);
  if (!value) return null;
  const match = /^([a-z]+)-(\d{1,12})$/.exec(value);
  if (!match || !PANEL_TYPES.includes(match[1])) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  return { id, type: /** @type {PanelTarget['type']} */ (match[1]) };
}

/**
 * The same query string with the panel set to `target`, or removed when
 * `target` is null. Every other parameter is kept, in order.
 *
 * @param {string} search
 * @param {PanelTarget | null} target
 * @returns {string}  "" or a string starting with "?"
 */
export function searchWithPanel(search, target) {
  const params = new URLSearchParams(search || '');
  if (target) params.set(PANEL_PARAM, panelParamValue(target));
  else params.delete(PANEL_PARAM);
  const out = params.toString();
  return out ? `?${out}` : '';
}

/** @param {PanelTarget | null} a @param {PanelTarget | null} b */
export function samePanel(a, b) {
  return !!a && !!b && Number(a.id) === Number(b.id) && a.type === b.type;
}
