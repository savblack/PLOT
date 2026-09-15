import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { backdropUrl } from '../utils/images.js';
import { tmdb } from '@plot/core/tmdb.js';
import { orderedCollectionParts } from '@plot/core/collections.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import CollectionFilms from './CollectionFilms.jsx';
import { useCollectionProgress } from '../hooks/useCollectionProgress.js';
import './CollectionCard.css';

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * A collection opened on its own, from search. Same drawer chrome as the
 * media panel, with the franchise's films as the body. Tapping a film swaps
 * this panel for that movie's; the card on the movie leads back here in
 * spirit, since it shows the same set.
 */
export default function CollectionPanel({ collectionId, closing, onClose }) {
  const { user, openPanel } = useApp();
  const history = useHistory(user?.id);
  const [collection, setCollection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    const data = await tmdb.getCollection(collectionId);
    if (data) setCollection(data); else setLoadError(true);
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset before fetching the newly-opened collection
    setCollection(null);
    load();
  }, [load]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !closing) { event.preventDefault(); onClose(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closing, onClose]);

  const parts = orderedCollectionParts(collection);
  const { items, watched, total, fraction } = useCollectionProgress(parts, { history });
  const stub = collection ? { id: collection.id, name: collection.name } : null;

  return (
    <>
      <div className={`panel-overlay${closing ? ' closing' : ''}`} onClick={onClose} />
      <div className={`panel${closing ? ' closing' : ''}`}>
        <div className={`panel-header-wrap${collection?.backdrop_path ? '' : ' panel-header-wrap--no-backdrop'}`}>
          {collection?.backdrop_path
            ? <img className="panel-header-img" src={backdropUrl(collection.backdrop_path)} alt="" />
            : <div className="panel-header-fallback" />}
          <button className="panel-close-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        {loading ? (
          <div className="panel-body"><LoadingSpinner /></div>
        ) : loadError || !stub ? (
          <div className="panel-body" style={{ textAlign: 'center', paddingTop: '2rem' }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {MEDIA_PANEL.couldNotLoadCollection}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
          </div>
        ) : (
          <div className="panel-body">
            <h2 className="panel-title">{collection.name}</h2>
            <div className="panel-meta-row">
              <span style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {MEDIA_PANEL.collectionResultMeta}
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                {MEDIA_PANEL.collectionProgress(watched, total)}
              </span>
            </div>
            {collection.overview && <p className="panel-overview">{collection.overview}</p>}
            <div className="collection-card">
              <div className="collection-card-bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={watched}>
                <div className="collection-card-bar-fill" style={{ width: `${Math.round(fraction * 100)}%` }} />
              </div>
              <CollectionFilms
                stub={stub}
                parts={parts}
                items={items}
                onOpenTitle={(id, type, source) => openPanel(id, type, source)}
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
