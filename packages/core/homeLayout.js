/* Home layout: which shelves show on Home, and in what order.
 *
 * Plot's Home is opinionated on purpose: the greeting, the Up next card, On
 * this day and the first-run Saved shelf are fixed. Everything below them is
 * a shelf the viewer may reorder or hide. The ids here are shared by web and
 * mobile so one saved layout applies on both; a platform that does not render
 * a given shelf simply skips it.
 *
 * Stored on profiles.home_layout as `{ order: string[], hidden: string[] }`.
 * A missing or malformed value means the default layout. Unknown ids are
 * dropped on read and shelves that were added after the layout was saved are
 * appended in their default place at the end, so adding a shelf never needs a
 * data migration.
 */

/** Shelves in their default order. Keep in step with HOME_SECTION in the apps. */
export const HOME_SECTION_IDS = Object.freeze([
  'picks',
  'continue',
  'hot',
  'weekly',
  'people',
  'releases',
  'binged',
  'cinema',
  'anticipated',
  'platforms',
]);

/** @typedef {{ order: string[], hidden: string[] }} HomeLayout */

/** @returns {HomeLayout} */
export function defaultHomeLayout() {
  return { order: [...HOME_SECTION_IDS], hidden: [] };
}

const known = new Set(HOME_SECTION_IDS);

/**
 * Coerce a stored value (or anything else) into a complete, valid layout.
 * @param {unknown} raw
 * @returns {HomeLayout}
 */
export function normalizeHomeLayout(raw) {
  const base = defaultHomeLayout();
  if (!raw || typeof raw !== 'object') return base;
  const seen = new Set();
  const order = [];
  for (const id of Array.isArray(raw.order) ? raw.order : []) {
    if (typeof id === 'string' && known.has(id) && !seen.has(id)) { seen.add(id); order.push(id); }
  }
  for (const id of HOME_SECTION_IDS) if (!seen.has(id)) order.push(id);
  const hidden = HOME_SECTION_IDS.filter(id => Array.isArray(raw.hidden) && raw.hidden.includes(id));
  return { order, hidden };
}

/** @param {HomeLayout} layout */
export function isDefaultHomeLayout(layout) {
  const l = normalizeHomeLayout(layout);
  return l.hidden.length === 0 && l.order.every((id, i) => id === HOME_SECTION_IDS[i]);
}

/**
 * Move a shelf to a new index. Out-of-range indices clamp; an unknown id is a no-op.
 * @param {HomeLayout} layout
 * @param {string} id
 * @param {number} toIndex
 * @returns {HomeLayout}
 */
export function moveHomeSection(layout, id, toIndex) {
  const l = normalizeHomeLayout(layout);
  const from = l.order.indexOf(id);
  if (from < 0) return l;
  const to = Math.max(0, Math.min(l.order.length - 1, toIndex));
  if (from === to) return l;
  const order = [...l.order];
  order.splice(from, 1);
  order.splice(to, 0, id);
  return { order, hidden: l.hidden };
}

/**
 * Move a shelf one step up (-1) or down (+1).
 * @param {HomeLayout} layout
 * @param {string} id
 * @param {-1 | 1} delta
 */
export function nudgeHomeSection(layout, id, delta) {
  const l = normalizeHomeLayout(layout);
  const from = l.order.indexOf(id);
  if (from < 0) return l;
  return moveHomeSection(l, id, from + delta);
}

/**
 * Show or hide a shelf.
 * @param {HomeLayout} layout
 * @param {string} id
 * @param {boolean} [visible] defaults to toggling
 * @returns {HomeLayout}
 */
export function setHomeSectionVisible(layout, id, visible) {
  const l = normalizeHomeLayout(layout);
  if (!known.has(id)) return l;
  const isHidden = l.hidden.includes(id);
  const show = visible === undefined ? isHidden : visible;
  if (show === !isHidden) return l;
  const hidden = show ? l.hidden.filter(h => h !== id) : HOME_SECTION_IDS.filter(s => s === id || l.hidden.includes(s));
  return { order: l.order, hidden };
}

/**
 * The shelves to render, in order, with hidden ones removed. `available` is
 * the set of ids that have content right now; shelves without content are
 * skipped exactly as they were before layouts existed.
 * @param {HomeLayout} layout
 * @param {Iterable<string>} available
 * @returns {string[]}
 */
export function visibleHomeSections(layout, available) {
  const l = normalizeHomeLayout(layout);
  const have = new Set(available);
  return l.order.filter(id => have.has(id) && !l.hidden.includes(id));
}
