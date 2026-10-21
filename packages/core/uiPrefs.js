/* How the app looks and is arranged for one person: card density, card style,
 * and the order of the sidebar.
 *
 * Stored on profiles.ui_prefs as
 * `{ density: 'comfy' | 'compact', cardStyle: 'poster' | 'list', sidebar: string[] }`.
 * A missing or malformed value means the defaults, and an unknown value in a
 * known field falls back to its default, so a newer client's choice never
 * breaks an older one. Free for everyone: these change how Plot is drawn, not
 * what it does.
 *
 * `sidebar` holds nav ids (APP_NAV_ITEMS in navigation.js) in the viewer's
 * order. Search stays first and Settings last whatever is saved, and items
 * added to the nav after the order was saved appear in their default place at
 * the end, so adding a nav item never needs a data migration. The mobile tab
 * bar and drawer do not use `sidebar`; it is web's sidebar.
 */

export const UI_DENSITIES = Object.freeze(['comfy', 'compact']);
export const CARD_STYLES = Object.freeze(['poster', 'list']);
/** Nav ids that keep their place at either end of the sidebar. */
export const SIDEBAR_FIXED_FIRST = Object.freeze(['search']);
export const SIDEBAR_FIXED_LAST = Object.freeze(['settings']);

/** @typedef {{ density: 'comfy' | 'compact', cardStyle: 'poster' | 'list', sidebar: string[] }} UiPrefs */

/** @returns {UiPrefs} */
export function defaultUiPrefs() {
  return { density: 'comfy', cardStyle: 'poster', sidebar: [] };
}

/**
 * Coerce a stored value (or anything else) into valid prefs.
 * @param {unknown} raw
 * @returns {UiPrefs}
 */
export function normalizeUiPrefs(raw) {
  const base = defaultUiPrefs();
  if (!raw || typeof raw !== 'object') return base;
  const seen = new Set();
  const sidebar = [];
  for (const id of Array.isArray(raw.sidebar) ? raw.sidebar : []) {
    if (typeof id === 'string' && id && !seen.has(id)) { seen.add(id); sidebar.push(id); }
  }
  return {
    density: UI_DENSITIES.includes(raw.density) ? raw.density : base.density,
    cardStyle: CARD_STYLES.includes(raw.cardStyle) ? raw.cardStyle : base.cardStyle,
    sidebar,
  };
}

/** @param {UiPrefs} prefs */
export function isDefaultUiPrefs(prefs) {
  const p = normalizeUiPrefs(prefs);
  return p.density === 'comfy' && p.cardStyle === 'poster' && p.sidebar.length === 0;
}

/** @param {UiPrefs} prefs @param {string} density */
export function setDensity(prefs, density) {
  const p = normalizeUiPrefs(prefs);
  return UI_DENSITIES.includes(density) ? { ...p, density } : p;
}

/** @param {UiPrefs} prefs @param {string} cardStyle */
export function setCardStyle(prefs, cardStyle) {
  const p = normalizeUiPrefs(prefs);
  return CARD_STYLES.includes(cardStyle) ? { ...p, cardStyle } : p;
}

/**
 * The sidebar's items in the viewer's order. `items` is the full nav in its
 * default order; the fixed ends are kept in place and only the middle moves.
 * @template {{ id: string }} T
 * @param {T[]} items
 * @param {string[]} order saved ids, any subset, any order
 * @returns {T[]}
 */
export function orderSidebarItems(items, order) {
  const first = items.filter(i => SIDEBAR_FIXED_FIRST.includes(i.id));
  const last = items.filter(i => SIDEBAR_FIXED_LAST.includes(i.id));
  const middle = items.filter(i => !SIDEBAR_FIXED_FIRST.includes(i.id) && !SIDEBAR_FIXED_LAST.includes(i.id));
  const rank = new Map((order ?? []).map((id, index) => [id, index]));
  const sorted = [...middle].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id) : Infinity;
    const rb = rank.has(b.id) ? rank.get(b.id) : Infinity;
    if (ra !== rb) return ra - rb;
    return middle.indexOf(a) - middle.indexOf(b);
  });
  return [...first, ...sorted, ...last];
}

/**
 * Save a full sidebar order after moving one item one step.
 * @param {UiPrefs} prefs
 * @param {string[]} currentIds the ids as shown now (movable ones, in order)
 * @param {string} id
 * @param {-1 | 1} delta
 * @returns {UiPrefs}
 */
export function nudgeSidebarItem(prefs, currentIds, id, delta) {
  const p = normalizeUiPrefs(prefs);
  const from = currentIds.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= currentIds.length) return p;
  const next = [...currentIds];
  [next[from], next[to]] = [next[to], next[from]];
  return { ...p, sidebar: next };
}

/**
 * Save a full sidebar order after dragging one item to a new place.
 * @param {UiPrefs} prefs
 * @param {string[]} currentIds the ids as shown now (movable ones, in order)
 * @param {string} id
 * @param {number} toIndex clamped into range
 * @returns {UiPrefs}
 */
export function moveSidebarItem(prefs, currentIds, id, toIndex) {
  const p = normalizeUiPrefs(prefs);
  const from = currentIds.indexOf(id);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(currentIds.length - 1, toIndex));
  if (from === to) return p;
  const next = [...currentIds];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return { ...p, sidebar: next };
}

/** @param {UiPrefs} prefs */
export const resetSidebar = (prefs) => ({ ...normalizeUiPrefs(prefs), sidebar: [] });
