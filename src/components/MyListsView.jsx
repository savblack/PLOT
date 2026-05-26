import { useState, useEffect, useCallback } from 'react';
import { useApp, posterUrl, TodayLabel, countdownChip } from '../App.jsx';
import { tmdb } from '../api/tmdb.js';
import { useHistory } from '../hooks/useHistory.js';
import { useGenres } from '../hooks/useGenres.js';
import { localDateStr } from '../utils/date.js';
import MultiSelect from './MultiSelect.jsx';
import MyListsSkeleton from './skeletons/MyListsSkeleton.jsx';

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
    if (tab !== 'search' || !query.trim()) { setResults([]); return; }
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
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
              Pick #{rank} {listType === 'movies' ? 'Movie' : 'TV Show'}
            </span>
            <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
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
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text-primary)',
              fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {searching && (
            <div className="loading-state" style={{ minHeight: 80 }}><div className="spinner" /></div>
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
    </div>
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
function AddToFavoritesModal({ onAdd, onClose }) {
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
    if (tab !== 'search' || !query.trim()) { setResults([]); return; }
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
        maxHeight: '80vh',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '1rem 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Add to Favorites</span>
            <button className="btn btn-ghost btn-xs" onClick={onClose}>✕</button>
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
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              background: 'var(--bg)', color: 'var(--text-primary)',
              fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
            }}
          />
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {searching && <div className="loading-state" style={{ minHeight: 80 }}><div className="spinner" /></div>}
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
    </div>
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
    if (rank === 1) return '#F59E0B';
    if (rank <= 3)  return 'var(--text-secondary)';
    return 'var(--text-muted)';
  };

  return (
    <div>
      <div className="date-group-header">
        <span className="date-group-label">{title}</span>
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
                fontSize: '1.4rem', fontWeight: 700,
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

        return (
          <div
            key={rank}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '1.4rem', fontWeight: 700,
              width: '2rem', textAlign: 'center', flexShrink: 0,
              color: rankColor(rank),
            }}>
              {rank}
            </span>
            <div
              style={{
                width: 40, height: 60, borderRadius: 4, overflow: 'hidden',
                background: 'var(--surface-raised)', flexShrink: 0, cursor: 'pointer',
              }}
              onClick={() => !editMode && openPanel(item.tmdb_id, item.media_type)}
            >
              {img && <img src={img} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div
              style={{ flex: 1, cursor: editMode ? 'default' : 'pointer', minWidth: 0 }}
              onClick={() => !editMode && openPanel(item.tmdb_id, item.media_type)}
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
        return (
          <div key={item.id} style={{ position: 'relative' }}>
            <div
              style={{
                aspectRatio: '2/3',
                borderRadius: 6,
                overflow: 'hidden',
                background: 'var(--surface-raised)',
                cursor: 'pointer',
              }}
              onClick={() => openPanel(item.tmdb_id, item.media_type)}
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
          <button className="btn btn-ghost btn-xs" onClick={() => setShowAdd(true)}>+ Add</button>
        </div>
      )}

      {favorites.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Heart anything to add it here
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Tap ♡ on any movie or TV show
          </div>
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
function CreateListModal({ onConfirm, onClose }) {
  const [name, setName] = useState('');
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
          onChange={e => setName(e.target.value)}
          autoFocus
          onKeyDown={e => e.key === 'Enter' && name.trim() && onConfirm(name)}
          style={{
            width: '100%', padding: '0.6rem 0.75rem', marginBottom: '0.75rem',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg)', color: 'var(--text-primary)',
            fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-primary btn-sm" style={{ flex: 1 }} disabled={!name.trim()} onClick={() => onConfirm(name)}>
            Create
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ── Custom lists section ── */
function CustomListsSection({ customLists: clHook, filterItems, hideHeader }) {
  const { openPanel } = useApp();
  const { lists, createList, deleteList, renameList, removeItem } = clHook;
  const [openItems, setOpenItems] = useState({});
  const [creatingList, setCreatingList] = useState(false);
  const [renamingId,   setRenamingId]   = useState(null);
  const [renameValue,  setRenameValue]  = useState('');
  const [menuOpen,     setMenuOpen]     = useState(null);

  const toggleList = (id) => setOpenItems(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  const isOpen = (id) => openItems[id] ?? true;

  const handleCreate = useCallback(async (name) => {
    await createList(name);
    setCreatingList(false);
  }, [createList]);

  const handleRename = useCallback(async (id) => {
    if (renameValue.trim()) await renameList(id, renameValue);
    setRenamingId(null);
    setRenameValue('');
  }, [renameList, renameValue]);

  return (
    <div style={{ marginBottom: '2rem' }}>
      {!hideHeader && (
        <div className="date-group-header">
          <span className="date-group-label">My Lists</span>
          <button className="btn btn-ghost btn-xs" onClick={() => setCreatingList(true)}>+ New List</button>
        </div>
      )}

      {lists.length === 0 && (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Create your first custom list
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Add titles from the detail panel
          </div>
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
            </button>

            <div style={{ position: 'relative' }}>
              <button
                className="btn btn-ghost btn-xs"
                onClick={() => setMenuOpen(menuOpen === list.id ? null : list.id)}
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
                    borderRadius: 'var(--radius-sm)',
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
                    >
                      Rename
                    </button>
                    <button
                      style={{ display: 'block', width: '100%', padding: '0.6rem 0.8rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: '#ef4444' }}
                      onClick={() => { deleteList(list.id); setMenuOpen(null); }}
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
                  border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
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
                  No items yet — add from the detail panel
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
        <CreateListModal onConfirm={handleCreate} onClose={() => setCreatingList(false)} />
      )}
    </div>
  );
}

/* ── Play icon for "Start Watching" button ── */
function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" style={{ width: 11, height: 11, flexShrink: 0 }}>
      <polygon points="3,1 14,8 3,15"/>
    </svg>
  );
}

/* ── Currently-watching section ── */
function WatchingSection({ watching, watchlist, hideHeader }) {
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
        return (
          <div key={item.tmdb_id} className="list-row" onClick={() => openPanel(item.tmdb_id, 'tv')}>
            <div className="list-row-poster">
              {img && <img src={img} alt={item.title} />}
            </div>
            <div className="list-row-info">
              <div className="list-row-title">{item.title}</div>
              <div className="list-row-meta">
                <span className="list-type-badge">Series</span>
                <span className="chip chip-episode" style={{ fontSize: '0.62rem' }}>{epCode}</span>
              </div>
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

        const handleStartWatching = async (e) => {
          e.stopPropagation();
          await watching.startWatching({
            id:          item.tmdb_id,
            title:       item.title || item.name,
            poster_path: item.poster_path,
            media_type:  'tv',
          });
          await watchlist.removeFromList(item.tmdb_id);
        };

        return (
          <div key={item.id} className="list-row" onClick={() => openPanel(item.tmdb_id, item.media_type || 'movie')}>
            <div className="list-row-poster">
              {img && <img src={img} alt={title} />}
            </div>
            <div className="list-row-info">
              <div className="list-row-title">{title}</div>
              <div className="list-row-meta">
                <span className="list-type-badge">{isTV ? 'Series' : 'Movie'}</span>
                {chip && <span className={`chip ${chip.cls}`} style={{ fontSize: '0.62rem' }}>{chip.label}</span>}
                {streamingChip && (
                  <span className={`chip ${streamingChip.cls}`} style={{ fontSize: '0.62rem' }}>
                    Streaming {streamingChip.label.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
            {isTV && (
              <div className="list-row-end">
                <button className="btn-start-watching" onClick={handleStartWatching} title="Start watching">
                  <PlayIcon /> Watch
                </button>
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
  const { user, topLists, favorites, customLists, watching, watchlist, openPanel } = useApp();
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
    if (typeFilters.length)  filtered = filtered.filter(i => typeFilters.includes(i.media_type));
    if (genreFilters.length) filtered = filtered.filter(i => !i.genre_ids?.length || i.genre_ids.some(id => genreFilters.includes(id)));
    return filtered;
  };

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <MyListsSkeleton />;
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

  // Data for "All" collapsible bars
  const watchingItems  = watching.items || [];
  const favItems       = filterItems(favorites.favorites || []);
  const customListData = customLists.lists || [];

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel /></span>
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
          <MultiSelect
            placeholder="Type"
            options={[{ id: 'movie', label: 'Movies' }, { id: 'tv', label: 'TV' }]}
            value={typeFilters}
            onChange={setTypeFilters}
          />
          {genres.length > 0 && (
            <MultiSelect
              placeholder="Genre"
              options={genres.map(g => ({ id: g.id, label: g.name }))}
              value={genreFilters}
              onChange={setGenreFilters}
            />
          )}
        </div>
      </div>

      {/* ── Watching ── */}
      {showWatching && watchingItems.length > 0 && (
        <>
          {isAll && <CollapsibleBar label="Watching" open={watchingOpen} onToggle={() => setWatchingOpen(o => !o)} />}
          {(!isAll || watchingOpen) && <WatchingSection watching={watching} watchlist={watchlist} hideHeader={isAll} />}
        </>
      )}
      {tab === 'watching' && watchingItems.length === 0 && (
        <WatchingSection watching={watching} watchlist={watchlist} />
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
          {isAll && <CollapsibleBar label="Top 10" open={top10Open} onToggle={() => setTop10Open(o => !o)} />}
          {(!isAll || top10Open) && (
            <>
              {(typeFilters.length === 0 || typeFilters.includes('movie')) && (
                <TopTenSection listType="movies" title={isAll ? 'Movies' : 'Top 10 Movies'} topLists={topLists} />
              )}
              {(typeFilters.length === 0 || typeFilters.includes('tv')) && (
                <TopTenSection listType="tv" title={isAll ? 'TV Shows' : 'Top 10 TV Shows'} topLists={topLists} />
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
