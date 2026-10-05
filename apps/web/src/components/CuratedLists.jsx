// Lists Plot has put together, saved to the viewer's account as an ordinary
// custom list (a card in Home's "plot's Picks"). Logic is in @plot/core
// (curatedLists.js, useCustomLists.copyCuratedList). Mobile parity: not
// shipped on mobile yet; the data and copy are already shared.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { posterUrl } from '../utils/images.js';
import { CURATED_LISTS as COPY } from '@plot/core/copy/curatedLists.js';
import { customListCreationError, isCustomListLimitError } from '@plot/core/customListCreation.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { customListKey, collectionPath } from '@plot/core/listCollections.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { createUndoBatch, UNDO_ACTIONS } from '@plot/core/undo.js';
import { track, EVENTS } from '../lib/analytics.js';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import UpgradeSheet from './UpgradeSheet.jsx';
import './CuratedLists.css';

/** How many posters the wall holds: ten across and three down in the desktop banner (CSS hides all but the first 18 on a phone). */
const WALL_POSTERS = 30;

/**
 * The card in plot's Picks, beside the hero. The list's top posters form a
 * tilted wall behind the same scrim, badge and title the hero uses, so the
 * two read as siblings.
 */
export function CuratedListCard({ curated, onOpen }) {
  const posters = curated.entries.filter(entry => entry.poster_path).slice(0, WALL_POSTERS);
  return (
    <div className="discover-hero curated-hero">
      <button type="button" className="discover-hero-hit interactive-surface" onClick={onOpen} aria-label={`${curated.title}. ${COPY.titleCount(curated.entries.length)}`}>
        <div className="curated-hero-wall" aria-hidden="true">
          {/* The card is usually second in the rotation, so its first posters load up
              front rather than blank when it slides in; the desktop-only rest stay lazy. */}
          {posters.map((entry, i) => (
            <img key={entry.tmdb_id} src={posterUrl(entry.poster_path, 'w185')} alt="" loading={i < 18 ? 'eager' : 'lazy'} />
          ))}
        </div>
        <div className="discover-hero-overlay">
          <span className="discover-hero-badge">{COPY.cardBadge}</span>
          <h2 className="discover-hero-title">{curated.title}</h2>
          <p className="discover-hero-meta">{COPY.cardMeta(curated.entries.length, curated.source.name)}</p>
        </div>
      </button>
    </div>
  );
}

/** The list in full, ranked, with "Save to my lists". */
export function CuratedListDialog({ curated, onClose, onOpenTitle }) {
  const { user, customLists, profile } = useApp();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: 'idle', message: '', listId: null });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const existingList = findDuplicateCustomList(customLists?.lists || [], curated.title);
  const saving = state.status === 'saving';

  const save = async () => {
    if (!user || saving) return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(customLists?.ownedCount ?? lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowUpgrade(true);
      return;
    }
    setState({ status: 'saving', message: '', listId: null });
    // A new list offers Undo once every title is on it.
    const undo = existingList ? null : createUndoBatch({ action: UNDO_ACTIONS.LIST_CREATE });
    let result;
    try {
      result = await customLists.copyCuratedList(curated, { undo, onUndone: () => setState({ status: 'idle', message: '', listId: null }) });
    } catch (error) {
      if (isCustomListLimitError(error)) { setState({ status: 'idle', message: '', listId: null }); setShowUpgrade(true); return; }
      setState({ status: 'error', message: customListCreationError(error, COPY.couldNotSave), listId: null });
      return;
    }
    if (!result) { setState({ status: 'error', message: COPY.couldNotSave, listId: null }); return; }
    undo?.offer({ meta: { listName: result.list.name } });
    track(EVENTS.CURATED_LIST_SAVED, { curated_list: curated.id, titles: curated.entries.length, reused_list: result.existing });
    setState({ status: 'saved', message: result.existing ? COPY.savedAgain : COPY.saved, listId: result.list.id });
  };

  const openMine = () => {
    const id = state.listId || existingList?.id;
    if (!id) return;
    onClose();
    navigate(collectionPath(customListKey(id)));
  };

  return (
    <ResponsiveDialog
      title={curated.title}
      onClose={onClose}
      tall
      footer={(
        <div className="curated-footer">
          {state.message && (
            <span className={`curated-status${state.status === 'error' ? ' curated-status--error' : ''}`} role="status">{state.message}</span>
          )}
          {!user && <span className="curated-status">{COPY.signIn}</span>}
          {user && state.status === 'saved' && (
            <button type="button" className="btn btn-primary btn-sm" onClick={openMine}>{COPY.openMine}</button>
          )}
          {user && state.status !== 'saved' && (
            <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={save}>
              {saving ? COPY.saving : COPY.save}
            </button>
          )}
        </div>
      )}
    >
      {showUpgrade && <UpgradeSheet reason="lists" onClose={() => setShowUpgrade(false)} />}
      <div className="curated-body">
        <p className="curated-blurb">{curated.blurb}</p>
        <a className="curated-source" href={curated.source.url} target="_blank" rel="noopener noreferrer">{COPY.viewSource}</a>
        <ol className="curated-rows">
          {curated.entries.map(entry => (
            <li key={`${entry.media_type}-${entry.tmdb_id}`}>
              <button type="button" className="curated-row" onClick={() => { onClose(); onOpenTitle?.(entry.tmdb_id, entry.media_type, 'curated_list'); }}>
                <span className="curated-rank">{entry.rank}</span>
                <span className="list-row-poster">
                  {entry.poster_path
                    ? <img src={posterUrl(entry.poster_path, 'w92')} alt="" loading="lazy" />
                    : <span className="curated-poster-fallback">{entry.title.charAt(0)}</span>}
                </span>
                <span className="list-row-title">{entry.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    </ResponsiveDialog>
  );
}
