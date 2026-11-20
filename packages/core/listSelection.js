/* Selecting several titles on one list and acting on them together.
 *
 * DOM-free: which lists can be selected on, what "Select all" picks, which
 * lists a selection can be copied to, and running a bulk write one title at a
 * time so a partial failure leaves the failed titles selected to try again.
 * The web list page (apps/web/src/components/ListSelection.jsx) draws it.
 */
import { isSmartList } from './smartLists.js';

/** What kind of list a selection is on. Also the `list_kind` analytics prop. */
export const LIST_SELECTION_KINDS = Object.freeze({
  WATCHLIST: 'watchlist',
  CUSTOM: 'custom',
  SHARED: 'shared',
});

/**
 * Which kind of list this is for bulk selection, or null when it has none.
 * A smart list is null: its contents come from its rules, so there is nothing
 * to remove from it or pick out of it by hand. Favorites and Top 5 keep their
 * own controls and are not passed here.
 *
 * @param {{ key?: string | null, list?: { role?: string, rules?: any, people?: { user_id?: string }[] } | null, userId?: string | null }} args
 *   key: the route key (`want` for the Watchlist); list: the custom list, if any
 * @returns {'watchlist' | 'custom' | 'shared' | null}
 */
export function listSelectionKind({ key = null, list = null, userId = null } = {}) {
  if (key === 'want') return LIST_SELECTION_KINDS.WATCHLIST;
  if (!list || isSmartList(list)) return null;
  const shared = list.role === 'member' || (list.people || []).some(p => p.user_id && p.user_id !== userId);
  return shared ? LIST_SELECTION_KINDS.SHARED : LIST_SELECTION_KINDS.CUSTOM;
}

/**
 * The TMDB ids a selection can hold: the titles showing right now, once
 * each, in order. Hidden by a filter means not selectable.
 * @param {{ tmdb_id?: number | string | null }[] | null | undefined} items
 * @returns {number[]}
 */
export function selectableIds(items) {
  const seen = new Set();
  const ids = [];
  for (const item of items || []) {
    const id = Number(item?.tmdb_id);
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/**
 * The selected ids that are still showing, in list order. A title selected
 * and then hidden by a filter is left out, so an action only ever touches what
 * the viewer can see.
 * @param {Iterable<number>} selected
 * @param {number[]} ids selectableIds() of the visible titles
 * @returns {number[]}
 */
export function visibleSelection(selected, ids) {
  const chosen = new Set(selected);
  return ids.filter(id => chosen.has(id));
}

/**
 * True when every visible title is selected (and there is at least one).
 * @param {Iterable<number>} selected
 * @param {number[]} ids
 */
export function isAllSelected(selected, ids) {
  return ids.length > 0 && visibleSelection(selected, ids).length === ids.length;
}

/**
 * Select all, or clear when everything visible is already selected.
 * @param {Iterable<number>} selected
 * @param {number[]} ids
 * @returns {Set<number>}
 */
export function toggleAllSelection(selected, ids) {
  return isAllSelected(selected, ids) ? new Set() : new Set(ids);
}

/**
 * The lists a selection can be added to: the viewer's hand-made lists
 * (their own and shared ones), never a smart list, and never the list the
 * selection came from. Each says how many of the selected titles it is
 * missing, so a list that already has them all can say so.
 *
 * @template {{ id: string, rules?: any, items?: { tmdb_id?: number | string }[] }} L
 * @param {L[] | null | undefined} lists customLists.lists
 * @param {number[]} ids the selected TMDB ids
 * @param {string | null} [currentListId]
 * @returns {{ list: L, missing: number[] }[]}
 */
export function addTargets(lists, ids, currentListId = null) {
  return (lists || [])
    .filter(list => list && list.id !== currentListId && !isSmartList(list))
    .map(list => {
      const have = new Set((list.items || []).map(i => Number(i.tmdb_id)));
      return { list, missing: ids.filter(id => !have.has(id)) };
    });
}

/**
 * Run one write per id, one at a time. Sequential on purpose: each write
 * updates the hook's local state, and the undo batch should collect its
 * reverts in order. A write that returns a falsy value or throws counts as
 * failed; the rest carry on.
 *
 * The hooks already report each failed write as `action_failed`, so this does
 * not report again.
 *
 * @param {number[]} ids
 * @param {(id: number) => Promise<unknown>} write
 * @returns {Promise<{ succeeded: number[], failed: number[] }>}
 */
export async function runBulk(ids, write) {
  const succeeded = [];
  const failed = [];
  for (const id of ids) {
    let ok;
    try {
      ok = !!(await write(id));
    } catch {
      ok = false;
    }
    (ok ? succeeded : failed).push(id);
  }
  return { succeeded, failed };
}
