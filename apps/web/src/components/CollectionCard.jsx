import { useEffect, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { posterUrl } from '../utils/images.js';
import { tmdb } from '@plot/core/tmdb.js';
import {
  collectionPartYear,
  collectionProgress,
  collectionStubFromDetails,
  orderedCollectionParts,
} from '@plot/core/collections.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { track, EVENTS } from '../lib/analytics.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { SHOW_PRICING_PAGE } from '../launchFeatures.js';
import './CollectionCard.css';

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
  );
}

/**
 * "Part of a collection": the franchise a movie belongs to, as a collapsible
 * card under "More like this". The header is the toggle and carries the
 * progress bar so the count reads in both states. Movies only — TMDB has no
 * collection concept for series, which is also why "Save as list" exists:
 * a saved collection is an ordinary custom list, and lists take TV.
 *
 * `history` comes from the panel rather than a second useHistory() so the
 * card and the panel never disagree about what is watched.
 */
export default function CollectionCard({ details, itemId, history, onOpenTitle }) {
  const { user, watchlist, customLists, profile } = useApp();
  const stub = collectionStubFromDetails(details);
  const [collection, setCollection] = useState(null);
  const [open, setOpen] = useState(false);
  const [saveState, setSaveState] = useState({ status: 'idle', message: '' });

  const collectionId = stub?.id ?? null;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clear the previous franchise before fetching the new one
    setCollection(null);
    setOpen(false);
    setSaveState({ status: 'idle', message: '' });
    if (!collectionId) return undefined;
    let cancelled = false;
    tmdb.getCollection(collectionId).then(data => {
      if (!cancelled && data) setCollection(data);
    });
    return () => { cancelled = true; };
  }, [collectionId]);

  if (!stub || !collection) return null;

  const parts = orderedCollectionParts(collection);
  if (parts.length < 2) return null;

  const { items, watched, total, fraction } = collectionProgress(parts, {
    currentId: itemId,
    isWatched: history.isWatched,
    isInWatchlist: watchlist.isInList,
  });

  const existingList = findDuplicateCustomList(customLists?.lists || [], stub.name);

  const saveAsList = async () => {
    if (!user || saveState.status === 'saving') return;
    const lists = customLists?.lists || [];
    if (!existingList && !canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setSaveState({
        status: 'error',
        message: SHOW_PRICING_PAGE
          ? `Free accounts can have ${FREE_CUSTOM_LIST_CAP} lists. PLOT Premium gets unlimited. Upgrade from Settings to unlock.`
          : `You've reached the ${FREE_CUSTOM_LIST_CAP}-list limit.`,
      });
      return;
    }
    setSaveState({ status: 'saving', message: '' });
    const list = existingList || await customLists.createList(stub.name);
    if (!list) {
      setSaveState({ status: 'error', message: MEDIA_PANEL.couldNotSaveCollection });
      return;
    }
    // Oldest first so the list's newest-first ordering ends with the first
    // film on top. Sequential: each add is an upsert and the hook's local
    // state update is per call.
    let failed = false;
    for (const part of [...parts].reverse()) {
      // eslint-disable-next-line no-await-in-loop
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

  const stack = items.slice(0, 4);
  const headerId = `collection-card-${stub.id}`;

  return (
    <section className="collection-card-section" aria-labelledby={`${headerId}-title`}>
      <div className="panel-section-title collection-card-heading" id={`${headerId}-title`}>{MEDIA_PANEL.partOfCollection}</div>
      <div className="collection-card">
        <button
          type="button"
          className="collection-card-header"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-controls={`${headerId}-body`}
        >
          <span className="collection-card-stack" aria-hidden="true">
            {stack.map(part => (
              part.poster_path
                ? <img key={part.id} src={posterUrl(part.poster_path, 'w92')} alt="" loading="lazy" />
                : <span key={part.id} />
            ))}
          </span>
          <span className="collection-card-titles">
            <span className="collection-card-name">{stub.name}</span>
            <span className="collection-card-count">{MEDIA_PANEL.collectionProgress(watched, total)}</span>
          </span>
          <span className={`collection-card-chevron${open ? ' collection-card-chevron--open' : ''}`}><ChevronIcon /></span>
        </button>
        <div className="collection-card-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={watched}>
          <div className="collection-card-bar-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
        </div>
        {open && (
          <div id={`${headerId}-body`} className="collection-card-body">
            {items.map(part => {
              const year = collectionPartYear(part);
              const meta = part.isCurrent ? [year, MEDIA_PANEL.viewing].filter(Boolean).join(' · ') : year;
              return (
                <button
                  type="button"
                  key={part.id}
                  className={`collection-card-row${part.isCurrent ? ' collection-card-row--current' : ''}`}
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
                    {meta && <span className="list-row-meta">{meta}</span>}
                  </span>
                  {part.watched && <span className="chip collection-chip-watched">Watched</span>}
                  {part.inWatchlist && <span className="chip collection-chip-listed">Watchlist</span>}
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
        )}
      </div>
    </section>
  );
}
