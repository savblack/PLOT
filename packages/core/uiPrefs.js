/* How the app looks and is arranged for one person: card density, card style,
 * and the order of the sidebar.
 *
 * Stored on profiles.ui_prefs as
 * `{ density: 'comfy' | 'compact', cardStyle: 'poster' | 'list', sidebar: string[],
 *    myLists: { order: string[], collapsed: string[] } }`.
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
 *
 * `myLists` is the My Lists page: `order` is its sections in the viewer's
 * order (empty means the default) and `collapsed` the ones folded shut.
 * Unknown ids are dropped on read and a section added later takes its default
 * place after the saved ones, the same rule as the sidebar.
 */

export const UI_DENSITIES = Object.freeze(['comfy', 'compact']);
export const CARD_STYLES = Object.freeze(['poster', 'list']);
/** Nav ids that keep their place at either end of the sidebar. */
export const SIDEBAR_FIXED_FIRST = Object.freeze(['search']);
export const SIDEBAR_FIXED_LAST = Object.freeze(['settings']);

/** The My Lists page's sections, in their default order. */
export const MY_LISTS_SECTION_IDS = Object.freeze(['watching', 'top', 'lists', 'smart', 'shared']);

/**
 * @typedef {{ order: string[], collapsed: string[] }} MyListsPrefs
 * @typedef {{ density: 'comfy' | 'compact', cardStyle: 'poster' | 'list', sidebar: string[], myLists: MyListsPrefs }} UiPrefs
 */

/** @returns {UiPrefs} */
export function defaultUiPrefs() {
  return { density: 'comfy', cardStyle: 'poster', sidebar: [], myLists: { order: [], collapsed: [] } };
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
    myLists: normalizeMyLists(raw.myLists),
  };
}

/** @param {unknown} raw @returns {MyListsPrefs} */
function normalizeMyLists(raw) {
  const pick = (value) => {
    const out = [];
    for (const id of Array.isArray(value) ? value : []) {
      if (MY_LISTS_SECTION_IDS.includes(id) && !out.includes(id)) out.push(id);
    }
    return out;
  };
  return { order: pick(raw?.order), collapsed: pick(raw?.collapsed) };
}

/** @param {UiPrefs} prefs */
export function isDefaultUiPrefs(prefs) {
  const p = normalizeUiPrefs(prefs);
  return p.density === 'comfy' && p.cardStyle === 'poster' && p.sidebar.length === 0
    && p.myLists.order.length === 0 && p.myLists.collapsed.length === 0;
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

/**
 * Every My Lists section in the viewer's order: the saved ones first, then
 * any the saved order does not mention, in their default order.
 * @param {string[] | undefined} order
 * @returns {string[]}
 */
export function orderMyListsSections(order) {
  const saved = (order ?? []).filter((id, i, all) => MY_LISTS_SECTION_IDS.includes(id) && all.indexOf(id) === i);
  return [...saved, ...MY_LISTS_SECTION_IDS.filter(id => !saved.includes(id))];
}

/**
 * Move a My Lists section to a new place among the ones shown. `currentIds`
 * is what the viewer sees (a section their account does not have is left
 * out); the rest keep their relative order after it.
 * @param {UiPrefs} prefs
 * @param {string[]} currentIds
 * @param {string} id
 * @param {number} toIndex clamped into range
 * @returns {UiPrefs}
 */
export function moveMyListsSection(prefs, currentIds, id, toIndex) {
  const p = normalizeUiPrefs(prefs);
  const from = currentIds.indexOf(id);
  if (from < 0) return p;
  const to = Math.max(0, Math.min(currentIds.length - 1, toIndex));
  if (from === to) return p;
  const next = [...currentIds];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return { ...p, myLists: { ...p.myLists, order: orderMyListsSections(next) } };
}

/** One step up (-1) or down (+1). @param {UiPrefs} prefs @param {string[]} currentIds @param {string} id @param {-1 | 1} delta */
export function nudgeMyListsSection(prefs, currentIds, id, delta) {
  const from = currentIds.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= currentIds.length) return normalizeUiPrefs(prefs);
  return moveMyListsSection(prefs, currentIds, id, to);
}

/**
 * Fold a My Lists section shut or open it.
 * @param {UiPrefs} prefs
 * @param {string} id
 * @param {boolean} [collapsed] defaults to toggling
 * @returns {UiPrefs}
 */
export function setMyListsCollapsed(prefs, id, collapsed) {
  const p = normalizeUiPrefs(prefs);
  if (!MY_LISTS_SECTION_IDS.includes(id)) return p;
  const is = p.myLists.collapsed.includes(id);
  const want = collapsed === undefined ? !is : collapsed;
  if (want === is) return p;
  const next = MY_LISTS_SECTION_IDS.filter(s => (s === id ? want : p.myLists.collapsed.includes(s)));
  return { ...p, myLists: { ...p.myLists, collapsed: next } };
}

/** Back to the default section order. Folded sections stay folded. @param {UiPrefs} prefs */
export function resetMyListsOrder(prefs) {
  const p = normalizeUiPrefs(prefs);
  return { ...p, myLists: { ...p.myLists, order: [] } };
}
