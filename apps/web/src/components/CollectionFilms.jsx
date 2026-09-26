import { customListCreationError, isCustomListLimitError } from '@plot/core/customListCreation.js';
import { useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { posterUrl } from '../utils/images.js';
import { collectionPartYear } from '@plot/core/collections.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { track, EVENTS } from '../lib/analytics.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { MEDIA } from '../copy/media.js';
import UpgradeSheet from './UpgradeSheet.jsx';

/**
 * The films of a collection as rows, plus the "Save as list" footer. Used
 * inside the collapsible card on a movie and as the body of the collection
 * panel opened from search.
 *
 * @param {{
 *   stub: { id: number, name: string },
 *   parts: any[],                 ordered parts (orderedCollectionParts)
 *   items: any[],                 collectionProgress().items
 *   onOpenTitle: (id: number, type: 'movie', source: string) => void,
 * }} props
 */
export default function CollectionFilms({ stub, parts, items, onOpenTitle }) {
  const { user, customLists, profile } = useApp();
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });
  const [showUpgrade, setShowUpgrade] = useState(false);
  const existingList = findDuplicateCustomList(customLists?.lists || [], stub.name);

  const saveAsList = async () => {
    if (!user || saveState.status === 'saving') return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowUpgrade(true);
      return;
    }
    setSaveState({ status: 'saving', message: '' });
    let list;
    try {
      list = existingList || await customLists.createList(stub.name);
    } catch (error) {
      if (isCustomListLimitError(error)) { setSaveState({ status: 'idle', message: '' }); setShowUpgrade(true); return; }
      setSaveState({ status: 'error', message: customListCreationError(error, MEDIA_PANEL.couldNotSaveCollection) });
      return;
    }
    if (!list) {
      setSaveState({ status: 'error', message: MEDIA_PANEL.couldNotSaveCollection });
      return;
    }
    // Oldest first so the list's newest-first ordering ends with the first
    // film on top. Sequential: each add is an upsert and the hook's local
    // state update is per call.
    let failed = false;
    for (const part of [...parts].reverse()) {
      const added = await customLists.addItem(list.id, part);
      if (!added) failed = true;
    }
    if (failed) {
      setSaveState({ status: 'error', message: MEDIA_PANEL.couldNotSaveCollection });
      return;
    }
    track(EVENTS.COLLECTION_SAVED_AS_LIST, { collection_id: stub.id, parts: parts.length, reused_list: !!existingList });
    setSaveState({ status: 'saved', message: MEDIA_PANEL.collectionSaved });
  };

  return (
    <div className="collection-card-body">
      {showUpgrade && <UpgradeSheet reason="lists" onClose={() => setShowUpgrade(false)} />}
      {items.map(part => {
        const year = collectionPartYear(part);
        const rowMeta = [
          year,
          part.isCurrent ? MEDIA_PANEL.viewing : '',
          part.inWatchlist ? MEDIA_PANEL.inWatchlist : '',
        ].filter(Boolean).join(' · ');
        return (
          <button
            type="button"
            key={part.id}
            className={`collection-card-row${part.isCurrent ? ' collection-card-row--current' : ''}${part.watched ? ' collection-card-row--watched' : ''}`}
            onClick={() => { if (!part.isCurrent) onOpenTitle(part.id, 'movie', 'collection'); }}
            aria-current={part.isCurrent ? 'true' : undefined}
          >
            <span className="list-row-poster">
              {part.poster_path
                ? <img src={posterUrl(part.poster_path, 'w92')} alt="" loading="lazy" />
                : <span className="collection-card-poster-fallback">{(part.title || '?').charAt(0)}</span>}
            </span>
            <span className="collection-card-row-text">
              <span className="list-row-title">{part.title}</span>
              {rowMeta && <span className="list-row-meta">{rowMeta}</span>}
            </span>
            {/* Watched reads as the tick it does on an episode, rather than a
                chip: one vocabulary for "I have seen this" across the panel. */}
            {part.watched && (
              <span className="collection-card-tick" aria-label={MEDIA.watched}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" fill="currentColor" stroke="currentColor" strokeWidth="1.5" />
                  <polyline points="9 12 11 14 15 10" stroke="var(--surface)" strokeWidth="2" fill="none" />
                </svg>
              </span>
            )}
          </button>
        );
      })}
      {user && (
        <div className="collection-card-footer">
          {saveState.message && (
            <span className={`collection-card-status${saveState.status === 'error' ? ' collection-card-status--error' : ''}`} role="status">
              {saveState.message}
            </span>
          )}
          {saveState.status !== 'saved' && (
            <button
              type="button"
              className="collection-card-save"
              onClick={saveAsList}
              disabled={saveState.status === 'saving'}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              {saveState.status === 'saving' ? MEDIA_PANEL.savingCollection : MEDIA_PANEL.saveCollectionAsList}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
