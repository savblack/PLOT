/* Undo for the last library change.
 *
 * One slot, not a history: the toast offers to reverse the most recent
 * removal, and a newer one replaces it. Both apps render the same slot
 * (web's UndoToast.jsx, mobile's UndoToast.tsx) through useUndo().
 *
 * Undo is opt-in per call. A removal is often one step of a bigger action:
 * "Mark as watched" also takes the title out of Want to Watch and stops
 * watching it, and offering to undo just that step would be wrong. So the
 * hooks only offer an undo when the caller passes `{ undo }`: `true` for a
 * single user action, or a batch from createUndoBatch() for a bulk one.
 *
 * Reverting writes the table directly and emits the change events, rather
 * than calling the hook's own add paths, for two reasons. Those paths fire
 * the success seams, and undoing a removal is not a new save: it must never
 * count as a committed action. And they read the hook's state through a
 * closure that was stale the moment the removal landed.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { supabase } from './supabase.js';
import { getConfig } from './config.js';
import { reportActionFailure, FAILED_ACTIONS } from './actionFailures.js';
import { UNDO } from './copy/undo.js';

/** How long the toast stays up. The UI owns the timer so it can pause it. */
export const UNDO_WINDOW_MS = 6000;
// Past this an offer is dropped even if no UI dismissed it, so a keyboard
// shortcut can never reverse something from minutes ago.
const UNDO_HARD_CAP_MS = 30_000;

/** What can be undone. Also the `action` prop on action_undone. */
export const UNDO_ACTIONS = Object.freeze({
  WATCHLIST_REMOVE: 'watchlist_remove',
  LIST_ITEM_REMOVE: 'list_item_remove',
  FAVOURITE_REMOVE: 'favourite_remove',
  HISTORY_REMOVE:   'history_remove',
  WATCHING_STOP:    'watching_stop',
  WATCH_PROGRESS:   'watch_progress',
});

/**
 * @typedef {Object} UndoOffer
 * @property {number} id
 * @property {string} action one of UNDO_ACTIONS
 * @property {number} count how many titles the offer covers
 * @property {string} [title] the title, for a single-title offer
 * @property {Record<string, any>} [meta] extra label context (list name, episode)
 * @property {number} offeredAt
 */

/** @type {(UndoOffer & { revert: () => Promise<void> }) | null} */
let current = null;
// The same object for the life of an offer, so useSyncExternalStore sees a
// stable snapshot and does not re-render in a loop.
/** @type {UndoOffer|null} */
let snapshot = null;
let nextId = 1;
const listeners = new Set();

function publish(next) {
  current = next;
  listeners.forEach(fn => { try { fn(); } catch { /* a listener must not break the others */ } });
}

/** @param {() => void} fn @returns {() => void} */
export function subscribeUndo(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** The live offer, without its revert function. @returns {UndoOffer|null} */
export function getUndo() {
  // Dropped quietly: this runs during render, where notifying is not allowed.
  if (current && Date.now() - current.offeredAt > UNDO_HARD_CAP_MS) { current = null; snapshot = null; }
  return snapshot;
}

/**
 * Offer to reverse a change. Replaces any earlier offer.
 * @param {{ action: string, revert: () => Promise<void>, count?: number, title?: string, meta?: Record<string, any> }} offer
 * @returns {number} the offer id
 */
export function offerUndo({ action, revert, count = 1, title, meta }) {
  const id = nextId++;
  snapshot = { id, action, count, title, meta, offeredAt: Date.now() };
  publish({ ...snapshot, revert });
  return id;
}

/** Close whatever is offered, e.g. when a tick went on to complete the series
 * and reversing only the tick would leave the completion behind. */
export function clearUndo() {
  if (current) { snapshot = null; publish(null); }
}

/** Close the offer without reverting. A stale id (already replaced) is ignored. */
export function dismissUndo(id) {
  if (current && current.id === id) { snapshot = null; publish(null); }
}

/**
 * Reverse the offered change. The offer is cleared first, so a double tap
 * cannot revert twice.
 * @param {number} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function runUndo(id) {
  if (!current || current.id !== id) return { ok: false };
  const { action, count, revert, offeredAt } = current;
  snapshot = null;
  publish(null);
  try {
    await revert();
  } catch (error) {
    console.error('[undo] revert failed', error);
    reportActionFailure(FAILED_ACTIONS.UNDO, error, { undone_action: action });
    return { ok: false };
  }
  try {
    getConfig().onUndo?.({ action, count, elapsed_ms: Date.now() - offeredAt });
  } catch { /* analytics is best-effort */ }
  return { ok: true };
}

/**
 * Collect the reverts of a bulk action into one offer, e.g. removing five
 * selected titles from Want to Watch. Call add() per item as each removal
 * succeeds, then offer() once at the end.
 * @param {{ action: string }} args
 */
export function createUndoBatch({ action }) {
  /** @type {{ revert: () => Promise<void>, title?: string }[]} */
  const entries = [];
  return {
    action,
    /** @param {{ revert: () => Promise<void>, title?: string }} entry */
    add(entry) { entries.push(entry); },
    /** @param {{ meta?: Record<string, any> }} [opts] */
    offer({ meta } = {}) {
      if (!entries.length) return null;
      const reverts = entries.map(e => e.revert);
      return offerUndo({
        action,
        count: entries.length,
        title: entries.length === 1 ? entries[0].title : undefined,
        meta,
        // One at a time: they touch the same tables, and a partial restore
        // should stop at the first failure rather than race past it.
        revert: async () => { for (const r of reverts) await r(); },
      });
    },
  };
}

/** @typedef {true | ReturnType<typeof createUndoBatch> | null | undefined} UndoOption */

/**
 * The hooks' side of the opt-in: offer on `true`, add to a batch, or do
 * nothing when the caller did not ask.
 * @param {UndoOption} option
 * @param {{ action: string, revert: () => Promise<void>, title?: string, meta?: Record<string, any> }} offer
 */
export function registerUndo(option, { action, revert, title, meta }) {
  if (!option) return;
  if (option === true) offerUndo({ action, revert, title, meta });
  else option.add({ revert, title });
}

/** React binding for the live offer. @returns {UndoOffer|null} */
export function useUndo() {
  return useSyncExternalStore(subscribeUndo, getUndo, getUndo);
}

const OUTCOME_MS = { restored: 1800, failed: 4000 };

/**
 * Everything the toast does except draw itself, shared by web and mobile:
 * the countdown (paused while the viewer is hovering, focused or pressing),
 * the brief "Restored." / "Could not undo" line afterwards, and the message.
 *
 * @param {{ region?: string }} [opts] the viewer's own profile region
 */
export function useUndoToast({ region } = {}) {
  const offer = useUndo();
  const [outcome, setOutcome] = useState(/** @type {'restored'|'failed'|null} */ (null));
  const [paused, setPaused] = useState(false);
  const remaining = useRef(UNDO_WINDOW_MS);
  const startedAt = useRef(0);
  const offerId = offer?.id;

  // A new offer restarts the clock and replaces any outcome line.
  useEffect(() => {
    if (!offerId) return;
    remaining.current = UNDO_WINDOW_MS;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- a new offer supersedes the last outcome
    setOutcome(null);
  }, [offerId]);

  useEffect(() => {
    if (!offerId || paused) return undefined;
    startedAt.current = Date.now();
    const timer = setTimeout(() => dismissUndo(offerId), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    };
  }, [offerId, paused]);

  useEffect(() => {
    if (!outcome) return undefined;
    const timer = setTimeout(() => setOutcome(null), OUTCOME_MS[outcome]);
    return () => clearTimeout(timer);
  }, [outcome]);

  const undo = useCallback(async () => {
    if (!offerId) return;
    const { ok } = await runUndo(offerId);
    setOutcome(ok ? 'restored' : 'failed');
  }, [offerId]);
  const dismiss = useCallback(() => { if (offerId) dismissUndo(offerId); }, [offerId]);
  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);

  const visible = !!offer || !!outcome;
  return {
    visible,
    offer,
    outcome,
    failed: !offer && outcome === 'failed',
    message: offer ? UNDO.message(offer, region) : outcome ? UNDO[outcome] : '',
    undo, dismiss, pause, resume,
  };
}

/* ── Restoring rows ──
   The columns each table accepts back. Local rows can carry fields a read
   added, and `id` is left out so the database assigns a fresh one.
   Timestamps are kept, so a restored title returns to its old place in a list
   sorted by when it was added. History is deliberately absent: it is written
   only by the sanctioned writers (see historyWriters.test.js), so its restore
   is restoreHistoryEntry in userMedia.js. */
const RESTORE_COLUMNS = {
  list_items:             ['list_id', 'user_id', 'tmdb_id', 'media_type', 'title', 'poster_path', 'release_date', 'genre_ids', 'provider_ids', 'streaming_date', 'created_at'],
  user_custom_list_items: ['list_id', 'user_id', 'tmdb_id', 'media_type', 'title', 'poster_path', 'genre_ids', 'added_at'],
  user_favourites:        ['user_id', 'tmdb_id', 'media_type', 'title', 'poster_path', 'genre_ids', 'created_at'],
  watching_progress:      ['user_id', 'tmdb_id', 'title', 'poster_path', 'current_season', 'current_episode', 'total_seasons', 'total_episodes', 'started_at', 'updated_at'],
};

/**
 * The subset of a local row that can be written back to `table`.
 * @param {keyof typeof RESTORE_COLUMNS} table
 * @param {Record<string, any>} row
 */
export function restorableRow(table, row) {
  const out = {};
  for (const column of RESTORE_COLUMNS[table]) if (row?.[column] !== undefined) out[column] = row[column];
  return out;
}

/**
 * Put a removed row back. A duplicate key means it is already back (the
 * user re-added it by hand before tapping Undo), which is the outcome wanted.
 * @param {keyof typeof RESTORE_COLUMNS} table
 * @param {Record<string, any>} row
 */
export async function restoreRow(table, row) {
  if (!RESTORE_COLUMNS[table]) throw new Error(`restoreRow: ${table} is not restorable here`);
  const { error } = await supabase.from(table).insert(restorableRow(table, row));
  if (error && error.code !== '23505') throw error;
}

/** Test seam: clear the slot between tests. */
export function _resetUndo() { snapshot = null; current = null; }
