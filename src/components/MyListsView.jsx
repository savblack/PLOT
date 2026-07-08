import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useApp, posterUrl, countdownChip } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import { findDuplicateCustomList } from '../domain/customLists.js';
import { useHistory } from '../hooks/useHistory.js';
import { useGenres } from '../hooks/useGenres.js';
import { localDateStr } from '../utils/date.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import PlotLoader from './PlotLoader.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { useShare } from '../hooks/useShare.js';
import { EVENTS, track } from '../lib/analytics.js';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '../core/premium.js';

/* ── Heart icon ── */
function HeartIcon({ filled }) {
  return filled ? (
    <svg viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/* ── Search modal for Top 10 additions ── */
function AddToRankModal({ listType, rank, onAdd, onClose }) {
  const { user } = useApp();
  const { entries } = useHistory(user?.id);
  const [tab,     setTab]     = useState('history'); // 'history' | 'search'
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const mediaFilter = listType === 'movies' ? 'movie' : 'tv';

  const historyFiltered = entries.filter(e =>
    e.media_type === mediaFilter &&
    (!query.trim() || (e.title || '').toLowerCase().includes(query.trim().toLowerCase()))
  );

  useEffect(() => {
    if (tab !== 'search' || !query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient search results when search mode closes
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const data = await tmdb.search(query);
      setResults(
        (data?.results || [])
          .filter(r => r.media_type === mediaFilter)
          .slice(0, 15)
      );
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, tab, mediaFilter]);

  const handleSelect = (item) => {
    onAdd(item);
    onClose();
  };

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: '58px', zIndex: 1000,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        height: '80vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Select #{rank} {listType === 'movies' ? 'Movie' : 'TV Show'}
            </span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button
              className={`sub-tab-btn${tab === 'history' ? ' active' : ''}`}
              onClick={() => { setTab('history'); setQuery(''); }}
            >
              From history
            </button>
            <button
              className={`sub-tab-btn${tab === 'search' ? ' active' : ''}`}
              onClick={() => setTab('search')}
            >
              Search all
            </button>
          </div>
          <input
            className="search-input"
            type="text"
            placeholder={tab === 'history' ? 'Filter your history…' : `Search ${listType === 'movies' ? 'movies' : 'TV shows'}…`}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'var(--bg)', color: 'var(--text-primary)',
              fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {searching && (
            <div className="loading-state" style={{ minHeight: 80 }}><PlotLoader size="sm" /></div>
          )}
          {tab === 'history' && historyFiltered.map(entry => (
            <ModalResultRow key={entry.id} item={entry} onSelect={handleSelect} />
          ))}
          {tab === 'history' && !historyFiltered.length && !searching && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No {listType === 'movies' ? 'movies' : 'TV shows'} in your history yet
            </div>
          )}
          {tab === 'search' && results.map(item => (
            <ModalResultRow key={item.id} item={item} onSelect={handleSelect} />
          ))}
          {tab === 'search' && !results.length && !searching && query.trim() && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No results found
            </div>
          )}
          {tab === 'search' && !query.trim() && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Start typing to search
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function ModalResultRow({ item, onSelect }) {
  const img   = posterUrl(item.poster_path, 'w92');
  const title = item.title || item.name || 'Unknown';
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  return (
    <button
      onClick={() => onSelect(item)}
      style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        width: '100%', padding: '0.6rem 1rem',
        border: 'none', borderBottom: '1px solid var(--border)',
        background: 'none', cursor: 'pointer', textAlign: 'left',
      }}
    >
      <div style={{
        width: 40, height: 60, borderRadius: 4, overflow: 'hidden',
        background: 'var(--surface-raised)', flexShrink: 0,
      }}>
        {img && <img src={img} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
      </div>
      <div>
        <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{title}</div>
        {year && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{year}</div>}
      </div>
    </button>
  );
}

/* ── Add to Favorites search modal ── */
function AddToFavoritesModal({ title = 'Add to Favorites', onAdd, onClose }) {
  const { user } = useApp();
  const { entries } = useHistory(user?.id);
  const [tab,     setTab]     = useState('history');
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const historyFiltered = entries.filter(e =>
    !query.trim() || (e.title || '').toLowerCase().includes(query.trim().toLowerCase())
  );

  useEffect(() => {
    if (tab !== 'search' || !query.trim()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset transient search results when search mode closes
      setResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const data = await tmdb.search(query);
      setResults(
        (data?.results || [])
          .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
          .slice(0, 15)
      );
      setSearching(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [query, tab]);

  const handleSelect = (item) => { onAdd(item); onClose(); };

  return createPortal(
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: '58px', zIndex: 1000,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        height: '80vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{title}</span>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1rem', padding: '0.25rem', lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <button className={`sub-tab-btn${tab === 'history' ? ' active' : ''}`} onClick={() => { setTab('history'); setQuery(''); }}>From history</button>
            <button className={`sub-tab-btn${tab === 'search' ? ' active' : ''}`} onClick={() => setTab('search')}>Search all</button>
          </div>
          <input
            type="text"
            placeholder={tab === 'history' ? 'Filter your history…' : 'Search movies & TV…'}
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
            style={{
              width: '100%', padding: '0.5rem 0.75rem',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              background: 'var(--bg)', color: 'var(--text-primary)',
              fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {searching && <div className="loading-state" style={{ minHeight: 80 }}><PlotLoader size="sm" /></div>}
          {tab === 'history' && historyFiltered.map(entry => (
            <ModalResultRow key={entry.id} item={entry} onSelect={handleSelect} />
          ))}
          {tab === 'history' && !historyFiltered.length && !searching && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nothing in your history yet</div>
          )}
          {tab === 'search' && results.map(item => (
            <ModalResultRow key={item.id} item={item} onSelect={handleSelect} />
          ))}
          {tab === 'search' && !results.length && !searching && query.trim() && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>No results found</div>
          )}
          {tab === 'search' && !query.trim() && (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>Start typing to search</div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ── Top 10 section ── */
function TopTenSection({ listType, title, topLists }) {
  const { openPanel } = useApp();
  const [editMode,    setEditMode]    = useState(false);
  const [addingRank,  setAddingRank]  = useState(null); // rank number for modal

  const items = topLists.lists[listType] || [];
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);

  const rankColor = (rank) => {
    if (rank === 1) return 'var(--accent)';
    if (rank <= 3)  return 'var(--text-secondary)';
    return 'var(--text-muted)';
  };

  return (
    <div>
      <div className="discover-plat-type-label mylists-topten-type-label">
        <span>{title}</span>
        {items.length > 0 && (
          <button
            className="btn btn-ghost btn-xs"
            onClick={() => setEditMode(m => !m)}
          >
            {editMode ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {slots.map(rank => {
        const item = items.find(i => i.rank === rank);

        if (!item) {
          return (
            <button
              key={rank}
              onClick={() => setAddingRank(rank)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                width: '100%', padding: '0.6rem 1rem',
                border: 'none', borderBottom: '1px solid var(--border)',
                background: 'none', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                fontFamily: 'var(--font-serif)',
                fontSize: '1.4rem', fontWeight: 600,
                width: '2rem', textAlign: 'center', flexShrink: 0,
                color: rankColor(rank),
              }}>
                {rank}
              </span>
              <div style={{
                width: 40, height: 60,
                border: '1.5px dashed var(--border-strong)',
                borderRadius: 4, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-muted)', fontSize: '1.2rem',
              }}>
                +
              </div>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                {rank === 1 ? "What's your GOAT?" : 'Add a title'}
              </span>
            </button>
          );
        }

        const img   = posterUrl(item.poster_path, 'w92');
        const title = item.title;
        const openDetails = () => {
          if (!editMode) openPanel(item.tmdb_id, item.media_type);
        };

        return (
          <div
            key={rank}
            className={!editMode ? 'interactive-surface' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}
            onClick={!editMode ? openDetails : undefined}
            {...(!editMode
              ? getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })
              : {})}
          >
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.4rem', fontWeight: 600,
              width: '2rem', textAlign: 'center', flexShrink: 0,
              color: rankColor(rank),
            }}>
              {rank}
            </span>
            <div
              style={{
                width: 40, height: 60, borderRadius: 4, overflow: 'hidden',
                background: 'var(--surface-raised)', flexShrink: 0,
              }}
            >
              {img && <img src={img} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div
              style={{ flex: 1, minWidth: 0 }}
            >
              <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {title}
              </div>
            </div>
            {editMode && (
              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={rank === 1}
                  onClick={() => topLists.moveUp(listType, rank)}
                  style={{ opacity: rank === 1 ? 0.3 : 1 }}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  disabled={rank === 10 || !items.find(i => i.rank === rank + 1)}
                  onClick={() => topLists.moveDown(listType, rank)}
                  style={{ opacity: (rank === 10 || !items.find(i => i.rank === rank + 1)) ? 0.3 : 1 }}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="btn btn-ghost btn-xs"
                  onClick={() => topLists.removeSlot(listType, item.tmdb_id)}
                  style={{ color: 'var(--text-muted)' }}
                >
                  ✕
                </button>
              </div>
            )}
          </div>
        );
      })}

      {addingRank && (
        <AddToRankModal
          listType={listType}
          rank={addingRank}
          onAdd={(item) => topLists.setSlot(listType, addingRank, item)}
          onClose={() => setAddingRank(null)}
        />
      )}
    </div>
  );
}

/* ── Poster grid (for Favorites and Custom Lists) ── */
function PosterGrid({ items, onRemove, openPanel }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: '0.5rem',
      padding: '0.75rem 1rem',
    }}>
      {items.map(item => {
        const img = posterUrl(item.poster_path, 'w185');
        const title = item.title || 'Unknown';
        const openDetails = () => openPanel(item.tmdb_id, item.media_type);
        return (
          <div key={item.id} style={{ position: 'relative' }}>
            <div
              className="interactive-surface"
              style={{
                aspectRatio: '2/3',
                borderRadius: 6,
                overflow: 'hidden',
                background: 'var(--surface-raised)',
                cursor: 'pointer',
              }}
              onClick={openDetails}
              {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
            >
              {img
                ? <img src={img} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.25rem' }}>{item.title}</div>
              }
            </div>
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(item.tmdb_id); }}
                style={{
                  position: 'absolute', top: 4, right: 4,
                  width: 20, height: 20,
                  background: 'rgba(0,0,0,0.6)',
                  border: 'none', borderRadius: '50%',
                  color: '#fff', fontSize: '0.65rem',
                  cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Favorites section ── */
function FavoritesSection({ favorites: favsHook, filterItems, hideHeader }) {
  const { openPanel } = useApp();
  const [showAdd, setShowAdd] = useState(false);
  const { favorites, isFavorite, toggleFavorite } = favsHook;

  const visible = filterItems ? filterItems(favorites) : favorites;

  return (
    <div>
      {!hideHeader && (
        <div className="date-group-header">
          <span className="date-group-label">Favourites</span>
          {visible.length > 0 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginRight: '0.25rem' }}>{visible.length}</span>
          )}
          <button
            className="date-group-action-btn date-group-action-btn--plain"
            type="button"
            aria-label="Add favourite"
            title="Add favourite"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon />
          </button>
        </div>
      )}

      {favorites.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Heart anything to add it here
          </div>
          <button
            className="empty-add-btn"
            type="button"
            aria-label="Add favourite"
            title="Add favourite"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon />
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: '1.5rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          No favorites match the current filters
        </div>
      ) : (
        <PosterGrid
          items={visible}
          openPanel={openPanel}
          onRemove={(tmdbId) => {
            const item = favorites.find(f => f.tmdb_id === tmdbId);
            if (item) toggleFavorite(item);
          }}
        />
      )}

      {showAdd && (
        <AddToFavoritesModal
          onAdd={(item) => {
            if (!isFavorite(item.id || item.tmdb_id)) toggleFavorite(item);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}

/* ── Create list modal ── */
function CreateListModal({ lists, onConfirm, onClose }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const duplicateList = findDuplicateCustomList(lists, name);

  const handleSubmit = async () => {
    if (!name.trim() || isSubmitting) return;
    if (duplicateList) {
      setError(`"${duplicateList.name}" already exists.`);
      return;
    }

    setIsSubmitting(true);
    setError('');
    try {
      const created = await onConfirm(name);
      if (!created) {
        setError('Could not create the list. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} onClick={onClose} />
      <div style={{
        position: 'relative',
        background: 'var(--surface)',
        borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        padding: '1.25rem 1rem 2rem',
      }}>
        <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '1rem' }}>New list</div>
        <input
          type="text"
          placeholder="List name…"
          value={name}
          disabled={isSubmitting}
          onChange={e => {
            setName(e.target.value);
            if (error) setError('');
          }}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && name.trim() && !isSubmitting && handleSubmit()}
          style={{
            width: '100%', padding: '0.6rem 0.75rem', marginBottom: '0.75rem',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
            background: 'var(--bg)', color: 'var(--text-primary)',
            fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
          }}
        />
        {error && (
          <div style={{ marginBottom: '0.75rem', color: '#ef4444', fontSize: '0.75rem' }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={!name.trim() || isSubmitting} onClick={handleSubmit}>
            {isSubmitting ? 'Creating…' : 'Create'}
          </button>
          <button className="btn btn-ghost btn-sm" disabled={isSubmitting} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ── Custom lists section ── */
function CustomListsSection({ customLists: clHook, filterItems, hideHeader }) {
  const { openPanel, profile, navigateTo } = useApp();
  const { lists, createList, deleteList, renameList, setListPublic, addItem, removeItem } = clHook;
  const { share } = useShare();

  const shareList = useCallback((list) => share({
    url: `${window.location.origin}/list/${list.id}`,
    title: `${list.name} · PLOT`,
    text: `My list "${list.name}" on PLOT`,
    event: EVENTS.LIST_SHARED,
    eventProps: { list_id: list.id },
  }), [share]);
  const [openItems, setOpenItems] = useState({});
  const [creatingList, setCreatingList] = useState(false);
  const [showCapNotice, setShowCapNotice] = useState(false);
  const [renamingId,   setRenamingId]   = useState(null);
  const [renameValue,  setRenameValue]  = useState('');
  const [menuOpen,     setMenuOpen]     = useState(null);
  const [showAddToList, setShowAddToList] = useState(null);

  const toggleList = (id) => setOpenItems(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  const isOpen = (id) => openItems[id] ?? true;

  // Free accounts get FREE_CUSTOM_LIST_CAP lists; Premium unlimited. The
  // DB (RLS insert policy) is the authority — this is just friendlier UX.
  const requestCreate = useCallback(() => {
    if (!canCreateCustomList(lists.length, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowCapNotice(true);
      return;
    }
    setShowCapNotice(false);
    setCreatingList(true);
  }, [lists.length, profile]);

  const handleCreate = useCallback(async (name) => {
    const created = await createList(name);
    if (created) setCreatingList(false);
    return created;
  }, [createList]);

  const handleRename = useCallback(async (id) => {
    if (!renameValue.trim()) return;
    const renamed = await renameList(id, renameValue);
    if (renamed) {
      setRenamingId(null);
      setRenameValue('');
    }
  }, [renameList, renameValue]);

  return (
    <div style={{ marginBottom: '2rem' }}>
      {!hideHeader && (
        <div className="date-group-header">
          <span className="date-group-label">My Lists</span>
          <button
            className="date-group-action-btn date-group-action-btn--plain"
            type="button"
            aria-label="Create new list"
            title="Create new list"
            onClick={requestCreate}
          >
            <PlusIcon />
          </button>
        </div>
      )}

      {showCapNotice && (
        <div style={{
          margin: '0.5rem 1rem', padding: '0.65rem 0.85rem',
          fontSize: '0.78rem', lineHeight: 1.45,
          color: 'var(--text-secondary)', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        }}>
          You&rsquo;ve got {FREE_CUSTOM_LIST_CAP} lists — PLOT Premium gets unlimited.{' '}
          <button
            type="button"
            onClick={() => navigateTo?.('settings')}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', fontWeight: 600, cursor: 'pointer', fontSize: 'inherit' }}
          >
            Get Premium
          </button>
        </div>
      )}

      {lists.length === 0 && (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Create your first custom list
          </div>
          <button
            className="empty-add-btn"
            type="button"
            aria-label="Create new list"
            title="Create new list"
            onClick={requestCreate}
          >
            <PlusIcon />
          </button>
        </div>
      )}

      {lists.map(list => (
        <div key={list.id}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.65rem 1rem',
            borderBottom: '1px solid var(--border)',
          }}>
            <button
              onClick={() => toggleList(list.id)}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
              }}
            >
              <svg
                style={{
                  width: 14, height: 14, flexShrink: 0,
                  transform: isOpen(list.id) ? 'rotate(90deg)' : 'rotate(0deg)',
                  transition: 'transform 0.15s ease',
                  stroke: 'var(--text-muted)', fill: 'none', strokeWidth: 2,
                }}
                viewBox="0 0 24 24"
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
              <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                {list.name}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {(list.items || []).length}
              </span>
              {list.is_public && (
                <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)', borderRadius: 'var(--radius-pill)', padding: '0.1rem 0.4rem' }}>
                  Public
                </span>
              )}
            </button>

            <div style={{ position: 'relative' }}>
              <button
                className="list-options-btn"
                onClick={() => setMenuOpen(menuOpen === list.id ? null : list.id)}
                aria-label={`Open options for ${list.name}`}
              >
                ···
              </button>
              {menuOpen === list.id && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setMenuOpen(null)} />
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 100,
                    background: 'var(--surface-raised)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    minWidth: 120,
                    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                  }}>
                    <button
                      style={{ display: 'block', width: '100%', padding: '0.6rem 0.8rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                      onClick={() => {
                        setRenamingId(list.id);
                        setRenameValue(list.name);
                        setMenuOpen(null);
                      }}
                      aria-label={`Rename ${list.name}`}
                    >
                      Rename
                    </button>
                    <button
                      style={{ display: 'block', width: '100%', padding: '0.6rem 0.8rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                      onClick={async () => {
                        await setListPublic(list.id, !list.is_public);
                        setMenuOpen(null);
                      }}
                      aria-label={list.is_public ? `Make ${list.name} private` : `Make ${list.name} public`}
                    >
                      {list.is_public ? 'Make private' : 'Make public'}
                    </button>
                    {list.is_public && (
                      <button
                        style={{ display: 'block', width: '100%', padding: '0.6rem 0.8rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                        onClick={() => { shareList(list); setMenuOpen(null); }}
                        aria-label={`Share ${list.name}`}
                      >
                        Share link
                      </button>
                    )}
                    <button
                      style={{ display: 'block', width: '100%', padding: '0.6rem 0.8rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: '#ef4444' }}
                      onClick={async () => {
                        const deleted = await deleteList(list.id);
                        if (deleted) setMenuOpen(null);
                      }}
                      aria-label={`Delete ${list.name}`}
                    >
                      Delete list
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {renamingId === list.id && (
            <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename(list.id)}
                autoFocus
                style={{
                  flex: 1, padding: '0.4rem 0.6rem',
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg)', color: 'var(--text-primary)',
                  fontSize: '0.875rem', outline: 'none',
                }}
              />
              <button className="btn btn-primary btn-xs" onClick={() => handleRename(list.id)}>Save</button>
              <button className="btn btn-ghost btn-xs" onClick={() => setRenamingId(null)}>✕</button>
            </div>
          )}

          {isOpen(list.id) && (() => {
            const allItems = list.items || [];
            const visibleItems = filterItems ? filterItems(allItems) : allItems;
            if (allItems.length === 0) {
              return (
                <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  <div style={{ marginBottom: '0.35rem' }}>No items yet</div>
                  <button
                    className="empty-add-btn"
                    type="button"
                    aria-label={`Add item to ${list.name}`}
                    title={`Add item to ${list.name}`}
                    onClick={() => setShowAddToList(list.id)}
                  >
                    <PlusIcon />
                  </button>
                </div>
              );
            }
            if (visibleItems.length === 0) {
              return (
                <div style={{ padding: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No items match the current filters
                </div>
              );
            }
            return (
              <PosterGrid
                items={visibleItems}
                openPanel={openPanel}
                onRemove={(tmdbId) => removeItem(list.id, tmdbId)}
              />
            );
          })()}
        </div>
      ))}

      {creatingList && (
        <CreateListModal lists={lists} onConfirm={handleCreate} onClose={() => setCreatingList(false)} />
      )}
      {showAddToList && (
        <AddToFavoritesModal
          title="Add to List"
          onAdd={(item) => addItem(showAddToList, item)}
          onClose={() => setShowAddToList(null)}
        />
      )}
    </div>
  );
}

/* ── Currently-watching section ── */
function WatchingSection({ watching, hideHeader }) {
  const { openPanel } = useApp();
  const items = watching.items || [];

  if (items.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Not watching anything yet</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Start a series from Want to Watch or from Search
        </div>
      </div>
    );
  }

  return (
    <div>
      {!hideHeader && (
        <div className="date-group-header">
          <span className="date-group-label">Watching</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{items.length}</span>
        </div>
      )}
      {items.map(item => {
        const img    = posterUrl(item.poster_path, 'w92');
        const epCode = `S${String(item.current_season).padStart(2,'0')}E${String(item.current_episode).padStart(2,'0')}`;
        const openDetails = () => openPanel(item.tmdb_id, 'tv');
        return (
          <div
            key={item.tmdb_id}
            className="list-row interactive-surface"
            onClick={openDetails}
            {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${item.title}` })}
          >
            <div className="list-row-poster">
              {img && <img src={img} alt={item.title} />}
            </div>
            <div className="list-row-info">
              <div className="list-row-title">{item.title}</div>
              <div className="list-row-meta">
                <span className="list-type-badge">Series</span>
              </div>
            </div>
            <div className="list-row-end mylists-row-status">
              <span className="chip chip-episode">{epCode}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Want to watch section ── */
function WantToWatchSection({ watchlist, watching, hideHeader }) {
  const { openPanel } = useApp();
  const todayStr = localDateStr();

  const watchingIds = new Set((watching.items || []).map(i => i.tmdb_id));
  const saved = (watchlist.items || []).filter(i => !watchingIds.has(Number(i.tmdb_id)));

  const comingSoon   = saved.filter(i => i.release_date && i.release_date > todayStr)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const availableNow = saved.filter(i => !i.release_date || i.release_date <= todayStr);
  const sorted = [...comingSoon, ...availableNow];

  if (sorted.length === 0) {
    return (
      <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nothing saved yet</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Tap the bookmark on any title to save it here
        </div>
      </div>
    );
  }

  return (
    <div>
      {!hideHeader && (
        <div className="date-group-header">
          <span className="date-group-label">Want to Watch</span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{sorted.length}</span>
        </div>
      )}
      {sorted.map(item => {
        const img           = posterUrl(item.poster_path, 'w92');
        const title         = item.title || item.name || 'Unknown';
        const isTV          = item.media_type === 'tv';
        const chip          = item.release_date ? countdownChip(item.release_date) : null;
        const streamingChip = item.streaming_date ? countdownChip(item.streaming_date) : null;
        const openDetails = () => openPanel(item.tmdb_id, item.media_type || 'movie');

        return (
          <div
            key={item.id}
            className="list-row interactive-surface"
            onClick={openDetails}
            {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
          >
            <div className="list-row-poster">
              {img && <img src={img} alt={title} />}
            </div>
            <div className="list-row-info">
              <div className="list-row-title">{title}</div>
              <div className="list-row-meta">
                <span className="list-type-badge">{isTV ? 'Series' : 'Movie'}</span>
              </div>
            </div>
            {(chip || streamingChip) && (
              <div className="list-row-end mylists-row-status">
                {chip && <span className={`chip ${chip.cls}`}>{chip.label}</span>}
                {streamingChip && (
                  <span className={`chip ${streamingChip.cls}`}>
                    Streaming {streamingChip.label.toLowerCase()}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Collapsible section bar (used under "All" tab) ── */
function CollapsibleBar({ label, open, onToggle }) {
  return (
    <button className="date-group-header date-group-collapsible" onClick={onToggle}>
      <span className="date-group-label">{label}</span>
      <svg className={`date-group-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

/* ── Main view ── */
export default function MyListsView() {
  const { user, topLists, favorites, customLists, watching, watchlist } = useApp();
  const genres = useGenres();

  const [tab,          setTab]          = useState('all');
  const [typeFilters,  setTypeFilters]  = useState([]);
  const [genreFilters, setGenreFilters] = useState([]);

  // Collapse state for "All" tab sections
  const [watchingOpen, setWatchingOpen] = useState(true);
  const [wantOpen,     setWantOpen]     = useState(true);
  const [top10Open,    setTop10Open]    = useState(true);
  const [favsOpen,     setFavsOpen]     = useState(true);
  const [listsOpen,    setListsOpen]    = useState(true);

  const filterItems = (items) => {
    let filtered = items;
    if (typeFilters.length) {
      filtered = filtered.filter(i =>
        (typeFilters.includes('tv') && i.media_type === 'tv') ||
        (typeFilters.includes('cinema') && i._cinema === true) ||
        (typeFilters.includes('movie') && i.media_type === 'movie' && !i._cinema)
      );
    }
    if (genreFilters.length) filtered = filtered.filter(i => !i.genre_ids?.length || i.genre_ids.some(id => genreFilters.includes(id)));
    return filtered;
  };

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  const TABS = [
    { id: 'all',       label: 'All'           },
    { id: 'watching',  label: 'Watching'      },
    { id: 'want',      label: 'Want to Watch' },
    { id: 'top10',     label: 'Top 10'        },
    { id: 'favorites', label: 'Favorites'     },
    { id: 'lists',     label: 'Lists'         },
  ];

  const isAll       = tab === 'all';
  const showWatching = isAll || tab === 'watching';
  const showWant     = isAll || tab === 'want';
  const showTop10    = isAll || tab === 'top10';
  const showFavs     = isAll || tab === 'favorites';
  const showLists    = isAll || tab === 'lists';

  const watchingItems  = watching.items || [];

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div className="sub-tabs">
        <div className="sub-tabs-scroll">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              className={`sub-tab-btn${tab === id ? ' active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sub-tabs-filters">
          <GroupedFilterMenu
            ariaLabel="Filter lists"
            groups={[
              {
                heading: 'Type',
                options: [
                  { id: 'movie',  label: 'Movies' },
                  { id: 'tv',     label: 'TV'     },
                  { id: 'cinema', label: 'Cinema' },
                ],
                value: typeFilters,
                onChange: setTypeFilters,
              },
              {
                heading: 'Genre',
                options: genres.map(g => ({ id: g.id, label: g.name })),
                value: genreFilters,
                onChange: setGenreFilters,
              },
            ]}
          />
        </div>
      </div>

      {/* ── Watching ── */}
      {showWatching && watchingItems.length > 0 && (
        <>
          {isAll && <CollapsibleBar label="Watching" open={watchingOpen} onToggle={() => setWatchingOpen(o => !o)} />}
          {(!isAll || watchingOpen) && <WatchingSection watching={watching} hideHeader={isAll} />}
        </>
      )}
      {tab === 'watching' && watchingItems.length === 0 && (
        <WatchingSection watching={watching} />
      )}

      {/* ── Want to Watch ── */}
      {showWant && (
        <>
          {isAll && <CollapsibleBar label="Want to Watch" open={wantOpen} onToggle={() => setWantOpen(o => !o)} />}
          {(!isAll || wantOpen) && <WantToWatchSection watchlist={watchlist} watching={watching} hideHeader={isAll} />}
        </>
      )}

      {/* ── Top 10 ── */}
      {showTop10 && (
        <>
          {(isAll || tab === 'top10') && <CollapsibleBar label="Top 10" open={top10Open} onToggle={() => setTop10Open(o => !o)} />}
          {(!isAll || top10Open) && (
            <>
              {(typeFilters.length === 0 || typeFilters.includes('movie')) && (
                <TopTenSection listType="movies" title="Movies" topLists={topLists} />
              )}
              {(typeFilters.length === 0 || typeFilters.includes('tv')) && (
                <TopTenSection listType="tv" title="TV Shows" topLists={topLists} />
              )}
            </>
          )}
        </>
      )}

      {/* ── Favorites ── */}
      {showFavs && (
        <>
          {isAll && <CollapsibleBar label="Favourites" open={favsOpen} onToggle={() => setFavsOpen(o => !o)} />}
          {(!isAll || favsOpen) && <FavoritesSection favorites={favorites} filterItems={filterItems} hideHeader={isAll} />}
        </>
      )}

      {/* ── My Lists ── */}
      {showLists && (
        <>
          {isAll && <CollapsibleBar label="My Lists" open={listsOpen} onToggle={() => setListsOpen(o => !o)} />}
          {(!isAll || listsOpen) && <CustomListsSection customLists={customLists} filterItems={filterItems} hideHeader={isAll} />}
        </>
      )}
    </div>
  );
}
