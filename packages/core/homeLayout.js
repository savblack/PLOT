/* Home layout: which shelves show on Home, and in what order.
 *
 * Plot's Home is opinionated on purpose: the greeting, the Up next card, On
 * this day and the first-run Saved shelf are fixed. Everything below them is
 * a shelf the viewer may reorder or hide. The ids here are shared by web and
 * mobile so one saved layout applies on both; a platform that does not render
 * a given shelf simply skips it.
 *
 * Stored on profiles.home_layout as
 * `{ order: string[], hidden: string[], pins: { kind, id }[] }`.
 * Pins (Premium) are shelves the viewer chose: Want to watch, one of their
 * lists, or a person they follow. They sit above the reorderable shelves, in
 * pin order. A missing or malformed value means the default layout. Unknown ids are
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

/** What a pin can point at. `watchlist` has one fixed id; `list` is a custom list id; `person` is a TMDB person id. */
export const PIN_KINDS = Object.freeze(['watchlist', 'list', 'person']);
export const WATCHLIST_PIN_ID = 'watchlist';
/** Pins a viewer can have at once. Home is a feed, not a dashboard. */
export const MAX_HOME_PINS = 5;

/**
 * @typedef {{ kind: 'watchlist' | 'list' | 'person', id: string }} HomePin
 * @typedef {{ order: string[], hidden: string[], pins: HomePin[] }} HomeLayout
 */

/** @returns {HomeLayout} */
export function defaultHomeLayout() {
  return { order: [...HOME_SECTION_IDS], hidden: [], pins: [] };
}

const known = new Set(HOME_SECTION_IDS);

/** Stable key for a pin: React keys, de-duplication, and "is this pinned". */
export const homePinKey = (pin) => `${pin.kind}:${pin.id}`;

/** @returns {HomePin | null} a clean pin, or null if this is not one */
function cleanPin(raw) {
  if (!raw || typeof raw !== 'object' || !PIN_KINDS.includes(raw.kind)) return null;
  const id = raw.kind === 'watchlist' ? WATCHLIST_PIN_ID : String(raw.id ?? '').trim();
  return id ? { kind: raw.kind, id } : null;
}

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
  const pinKeys = new Set();
  const pins = [];
  for (const candidate of Array.isArray(raw.pins) ? raw.pins : []) {
    const pin = cleanPin(candidate);
    if (!pin || pinKeys.has(homePinKey(pin)) || pins.length >= MAX_HOME_PINS) continue;
    pinKeys.add(homePinKey(pin));
    pins.push(pin);
  }
  return { order, hidden, pins };
}

/** @param {HomeLayout} layout */
export function isDefaultHomeLayout(layout) {
  const l = normalizeHomeLayout(layout);
  return l.hidden.length === 0 && l.pins.length === 0 && l.order.every((id, i) => id === HOME_SECTION_IDS[i]);
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
  return { ...l, order };
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
  return { ...l, hidden };
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

/**
 * Pin a shelf to the top of Home. Does nothing for a duplicate, an unknown
 * kind, or when MAX_HOME_PINS is reached; use canPinMore first to say why.
 * @param {HomeLayout} layout
 * @param {{ kind: string, id: string | number }} pin
 * @returns {HomeLayout}
 */
export function addHomePin(layout, pin) {
  const l = normalizeHomeLayout(layout);
  const next = cleanPin({ kind: pin?.kind, id: pin?.id });
  if (!next || l.pins.length >= MAX_HOME_PINS) return l;
  if (l.pins.some(p => homePinKey(p) === homePinKey(next))) return l;
  return { ...l, pins: [...l.pins, next] };
}

/** @param {HomeLayout} layout */
export const canPinMore = (layout) => normalizeHomeLayout(layout).pins.length < MAX_HOME_PINS;

/**
 * @param {HomeLayout} layout
 * @param {{ kind: string, id: string | number }} pin
 * @returns {HomeLayout}
 */
export function removeHomePin(layout, pin) {
  const l = normalizeHomeLayout(layout);
  const target = cleanPin({ kind: pin?.kind, id: pin?.id });
  if (!target) return l;
  return { ...l, pins: l.pins.filter(p => homePinKey(p) !== homePinKey(target)) };
}

/**
 * Move a pin one step up (-1) or down (+1) among the pins.
 * @param {HomeLayout} layout
 * @param {{ kind: string, id: string | number }} pin
 * @param {-1 | 1} delta
 * @returns {HomeLayout}
 */
export function nudgeHomePin(layout, pin, delta) {
  const l = normalizeHomeLayout(layout);
  const target = cleanPin({ kind: pin?.kind, id: pin?.id });
  const from = target ? l.pins.findIndex(p => homePinKey(p) === homePinKey(target)) : -1;
  const to = from + delta;
  if (from < 0 || to < 0 || to >= l.pins.length) return l;
  const pins = [...l.pins];
  [pins[from], pins[to]] = [pins[to], pins[from]];
  return { ...l, pins };
}

/**
 * Pins to draw: only when the viewer is Premium (a lapsed member keeps their
 * pins stored and they return with Premium), and only ones that still resolve
 * (a deleted list, an unfollowed person). `exists` answers per pin.
 * @param {HomeLayout} layout
 * @param {{ premium: boolean, exists: (pin: HomePin) => boolean }} opts
 * @returns {HomePin[]}
 */
export function visibleHomePins(layout, { premium, exists }) {
  if (!premium) return [];
  return normalizeHomeLayout(layout).pins.filter(pin => exists(pin));
}
