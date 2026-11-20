import { useState } from 'react';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { COMMON } from '@plot/core/copy/common.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { createUndoBatch } from '@plot/core/undo.js';
import { emit, NOTICE_EVENT } from '@plot/core/events.js';
import { addTargets, isAllSelected, runBulk, toggleAllSelection, visibleSelection } from '@plot/core/listSelection.js';
import { EVENTS, track } from '../lib/analytics.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import './ListSelection.css';

const S = CUSTOM_LISTS.selection;

/* Select several titles on a list page and act on them together: Remove
   (with one Undo for the lot) or Add to list. The rules (which lists, what
   Select all picks, one write at a time) live in @plot/core/listSelection.js,
   the selection state in hooks/useListSelection.js. */

/**
 * The toolbar's Select button: a word, not an icon, and pressed while selecting.
 * @param {{ active: boolean, onToggle: () => void, buttonRef?: (el: HTMLButtonElement | null) => void }} props
 */
export function SelectToggle({ active, onToggle, buttonRef }) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="list-select-toggle"
      aria-pressed={active}
      aria-label={S.start}
      onClick={onToggle}
    >
      {COMMON.select}
    </button>
  );
}

/**
 * The bar at the bottom of the list while selecting.
 *
 * @param {{
 *   selection: import('../hooks/useListSelection.js').ListSelection,
 *   ids: number[],
 *   kind: 'watchlist' | 'custom' | 'shared',
 *   removeOne: (tmdbId: number, batch: ReturnType<typeof createUndoBatch>) => Promise<unknown>,
 *   undoAction: string,
 *   undoMeta?: Record<string, any>,
 *   lists?: any[],
 *   currentListId?: string | null,
 *   addOne?: (listId: string, tmdbId: number) => Promise<unknown>,
 * }} props
 *   ids: selectableIds() of the titles showing; removeOne / addOne: the same
 *   single-title paths the rest of the app uses, returning truthy on success
 */
export function SelectionBar({ selection, ids, kind, removeOne, undoAction, undoMeta, lists = [], currentListId = null, addOne }) {
  const [busy, setBusy] = useState(/** @type {'remove' | 'add' | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [picking, setPicking] = useState(false);

  const chosen = visibleSelection(selection.selected, ids);
  const count = chosen.length;
  const all = isAllSelected(selection.selected, ids);
  const targets = addOne ? addTargets(lists, chosen, currentListId) : [];
  const canAdd = !!addOne && addTargets(lists, [], currentListId).length > 0;
  const idle = busy === null;

  const remove = async () => {
    if (!count || !idle) return;
    setBusy('remove');
    setError(null);
    // One Undo for the whole selection, as the single remove offers one.
    const batch = createUndoBatch({ action: undoAction });
    const { succeeded, failed } = await runBulk(chosen, (id) => removeOne(id, batch));
    batch.offer(undoMeta ? { meta: undoMeta } : undefined);
    if (succeeded.length) track(EVENTS.LIST_ITEMS_BULK_REMOVED, { count: succeeded.length, list_kind: kind });
    setBusy(null);
    if (failed.length) {
      // Each failure already reported action_failed from the hook. Keep the
      // failed titles selected so trying again is one tap.
      selection.setSelected(new Set(failed));
      setError(S.removeFailed(failed.length));
    } else {
      selection.finish();
    }
  };

  const addTo = async ({ list, missing }) => {
    if (!idle || !addOne) return;
    setBusy('add');
    setError(null);
    const { succeeded, failed } = await runBulk(missing, (id) => addOne(list.id, id));
    setBusy(null);
    setPicking(false);
    if (failed.length) {
      selection.setSelected(new Set(failed));
      setError(S.addFailed(failed.length));
      return;
    }
    emit(NOTICE_EVENT, { message: S.added(succeeded.length, list.name) });
    selection.finish();
  };

  return (
    <div className="list-select-bar" role="region" aria-label={S.bar}>
      <div className="list-select-bar-main">
        <div className="list-select-bar-status">
          <span className="list-select-bar-count" aria-live="polite">{count > 0 ? S.count(count) : S.hint}</span>
          {ids.length > 0 && (
            <button
              type="button"
              className="list-select-bar-all"
              onClick={() => { setError(null); selection.setSelected(toggleAllSelection(selection.selected, ids)); }}
            >
              {all ? S.clearAll : S.selectAll}
            </button>
          )}
        </div>
        <div className="list-select-bar-actions">
          {canAdd && (
            <button type="button" className="btn btn-secondary btn-sm list-select-bar-btn" disabled={!count || !idle} onClick={() => setPicking(true)}>
              {busy === 'add' ? S.adding : S.addToList}
            </button>
          )}
          <button type="button" className="btn btn-sm list-select-bar-btn list-select-bar-remove" disabled={!count || !idle} onClick={remove}>
            {busy === 'remove' ? S.removing : COMMON.remove}
          </button>
          <button type="button" className="btn btn-ghost btn-sm list-select-bar-btn" disabled={!idle} onClick={selection.finish}>
            {COMMON.done}
          </button>
        </div>
      </div>
      {error && <p className="list-select-bar-error" role="alert">{error}</p>}
      {picking && (
        <ResponsiveDialog title={MEDIA.addToList} size="compact" onClose={() => { if (idle) setPicking(false); }}>
          <div className="responsive-dialog-scroll add-list-rows">
            {targets.map((target) => {
              const done = target.missing.length === 0;
              return (
                <button
                  key={target.list.id}
                  type="button"
                  className={`add-list-row${done ? ' selected' : ''}`}
                  disabled={done || !idle}
                  onClick={() => addTo(target)}
                >
                  <span className="add-list-cover" aria-hidden="true"><i /><i /><i /></span>
                  <span className="add-list-copy">
                    <strong>{target.list.name}</strong>
                    <small>{done ? S.alreadyThere : MEDIA.titleCount((target.list.items || []).length)}</small>
                  </span>
                </button>
              );
            })}
          </div>
        </ResponsiveDialog>
      )}
    </div>
  );
}
