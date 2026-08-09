import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { countdownChip } from '../utils/countdown.js';
import { TodayLabel } from './TodayLabel.jsx';
import { posterUrl } from '../utils/images.js';
import { tmdb } from '../api/tmdb.js';
import { findDuplicateCustomList } from '../domain/customLists.js';
import { useHistory } from '../hooks/useHistory.js';
import { localDateStr } from '../utils/date.js';
import { favoriteWords } from '../utils/spelling.js';
import { COMMON } from '../copy/common.js';
import { groupEntriesByMonth, historyRatingLabel, monthLabel } from '../utils/history.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import CollapsibleSection from './CollapsibleSection.jsx';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';
import SectionToggleIcon from './SectionToggleIcon.jsx';
import KebabMenu from './KebabMenu.jsx';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import SheetHeader from './SheetHeader.jsx';
import { getButtonLikeProps } from '../utils/interactive.js';
import { useShare } from '../hooks/useShare.js';
import { EVENTS, track } from '../lib/analytics.js';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { getStoredSectionOpen, storeSectionOpen } from '../utils/sectionOpenState.js';
import { MEDIA } from '../copy/media.js';

const ALL_LIST_SECTION_IDS = ['watching', 'want', 'top10', 'favorites', 'lists'];

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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
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
    // `entries` are raw `history` rows: `.id` is the row's own primary key,
    // not a TMDB id (that's `.tmdb_id`). Normalize before handing off so
    // `onAdd` always sees a TMDB-result-shaped item, same as the search tab.
    onAdd(tab === 'history' ? { ...item, id: item.tmdb_id } : item);
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
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0.5rem auto 0' }} />
        <SheetHeader title={`Select #${rank} ${listType === 'movies' ? 'Movie' : 'TV Show'}`} onClose={onClose} bordered={false} />
        <div style={{ padding: '0 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
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

  const handleSelect = (item) => {
    // `entries` are raw `history` rows: `.id` is the row's own primary key,
    // not a TMDB id (that's `.tmdb_id`). Normalize before handing off so
    // `onAdd` always sees a TMDB-result-shaped item, same as the search tab.
    onAdd(tab === 'history' ? { ...item, id: item.tmdb_id } : item);
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
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0.5rem auto 0' }} />
        <SheetHeader title={title} onClose={onClose} bordered={false} />
        <div style={{ padding: '0 1rem 0.5rem', borderBottom: '1px solid var(--border)' }}>
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
  const [open,        setOpen]        = useState(true);
  const [editMode,    setEditMode]    = useState(false);
  const [addingRank,  setAddingRank]  = useState(null); // rank number for modal
  const [dragRank,    setDragRank]    = useState(null);
  const [dragOffset,  setDragOffset]  = useState(0);
  const dragInfoRef = useRef({ startY: 0, rowHeight: 0 });
  const rowRefs = useRef({});

  const items = topLists.lists[listType] || [];
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);

  const rankColor = (rank) => {
    if (rank === 1) return 'var(--accent)';
    if (rank <= 3)  return 'var(--text-secondary)';
    return 'var(--text-muted)';
  };

  const moveItemToRank = useCallback(async (fromRank, toRank) => {
    let current = fromRank;
    if (fromRank < toRank) {
      while (current < toRank) {
        const ok = await topLists.moveDown(listType, current);
        if (!ok) break;
        current++;
      }
    } else {
      while (current > toRank) {
        const ok = await topLists.moveUp(listType, current);
        if (!ok) break;
        current--;
      }
    }
  }, [listType, topLists]);

  const handleDragStart = (e) => {
    if (!editMode || e.target.closest('button')) return;
    const rank = Number(e.currentTarget.dataset.rank);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragInfoRef.current = { startY: e.clientY, rowHeight: rowRefs.current[rank]?.offsetHeight || 76 };
    setDragRank(rank);
    setDragOffset(0);
  };

  const handleDragMove = (e) => {
    if (dragRank == null) return;
    setDragOffset(e.clientY - dragInfoRef.current.startY);
  };

  const handleDragEnd = () => {
    if (dragRank == null) return;
    const { rowHeight } = dragInfoRef.current;
    const maxRank = items.reduce((max, i) => Math.max(max, i.rank), 1);
    const steps = Math.round(dragOffset / rowHeight);
    const targetRank = Math.min(Math.max(dragRank + steps, 1), maxRank);
    setDragRank(null);
    setDragOffset(0);
    if (targetRank !== dragRank) moveItemToRank(dragRank, targetRank);
  };

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        padding: '0.65rem 1rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0,
          }}
        >
          <svg
            style={{
              width: 14, height: 14, flexShrink: 0,
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s ease',
              stroke: 'var(--text-muted)', fill: 'none', strokeWidth: 2,
            }}
            viewBox="0 0 24 24"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            {title}
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            {items.length}
          </span>
        </button>

        {items.length > 0 && (
          <button
            className="list-options-btn"
            onClick={() => setEditMode(m => !m)}
            aria-label={editMode ? 'Done editing' : 'Edit list'}
          >
            {editMode
              ? <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Done</span>
              : (
                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 16, height: 16 }}>
                  <circle cx="5" cy="12" r="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="19" cy="12" r="2"/>
                </svg>
              )
            }
          </button>
        )}
      </div>

      {open && slots.map(rank => {
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

        const isDragging = dragRank === rank;

        return (
          <div
            key={rank}
            ref={el => { rowRefs.current[rank] = el; }}
            data-rank={rank}
            className={!editMode ? 'interactive-surface' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.6rem 1rem',
              borderBottom: '1px solid var(--border)',
              touchAction: editMode ? 'none' : undefined,
              position: isDragging ? 'relative' : undefined,
              zIndex: isDragging ? 2 : undefined,
              transform: isDragging ? `translateY(${dragOffset}px)` : undefined,
              transition: isDragging ? 'none' : undefined,
              background: isDragging ? 'var(--surface-raised)' : undefined,
              boxShadow: isDragging ? 'var(--shadow-overlay)' : undefined,
            }}
            onClick={!editMode ? openDetails : undefined}
            onPointerDown={editMode ? handleDragStart : undefined}
            onPointerMove={editMode ? handleDragMove : undefined}
            onPointerUp={editMode ? handleDragEnd : undefined}
            onPointerCancel={editMode ? handleDragEnd : undefined}
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

/* ── Selection circle, top-right overlay used by every list's multi-select edit mode ── */
function SelectCircle({ selected, variant = 'grid', onClick, label }) {
  return (
    <button
      type="button"
      className={`select-circle select-circle--${variant}${selected ? ' selected' : ''}`}
      onClick={onClick}
      aria-pressed={selected}
      aria-label={label}
    >
      {selected && (
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
    </button>
  );
}

/* ── Poster grid (for Favorites and Custom Lists) ── */
function PosterGrid({ items, openPanel, editMode, selectedIds, onToggleSelect }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
      gap: '0.5rem',
      padding: '0.75rem 1rem',
    }}>
      {items.map(item => {
        const img = posterUrl(item.poster_path, 'w185');
        const title = item.title || 'Unknown';
        const isSelected = !!selectedIds?.has(item.tmdb_id);
        const openDetails = () => {
          if (editMode) onToggleSelect(item.tmdb_id);
          else openPanel(item.tmdb_id, item.media_type);
        };
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
              {...getButtonLikeProps({ onPress: openDetails, label: editMode ? `${isSelected ? 'Deselect' : 'Select'} ${title}` : `View details for ${title}` })}
            >
              {img
                ? <img src={img} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.25rem' }}>{item.title}</div>
              }
            </div>
            {editMode && (
              <SelectCircle
                variant="grid"
                selected={isSelected}
                onClick={(e) => { e.stopPropagation(); onToggleSelect(item.tmdb_id); }}
                label={isSelected ? `Deselect ${title}` : `Select ${title}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Favorites section ── */
function FavoritesSection({ favorites: favsHook, filterItems, open, onOpenChange }) {
  const { openPanel, profile } = useApp();
  const fw = favoriteWords(profile?.region);
  const [showAdd, setShowAdd] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const { favorites, isFavorite, toggleFavorite } = favsHook;

  const visible = filterItems ? filterItems(favorites) : favorites;

  const toggleSelect = (tmdbId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
      return next;
    });
  };

  const exitEditMode = () => { setEditMode(false); setSelected(new Set()); };

  const deleteSelected = () => {
    selected.forEach(tmdbId => {
      const item = favorites.find(f => f.tmdb_id === tmdbId);
      // toggleFavorite resolves the id via tmdbIdFromItem, which reads `id`
      // before `tmdb_id` — right for a TMDB result, wrong for a row out of
      // user_favourites whose `id` is the row's uuid. Number(uuid) is NaN, so
      // passing the row unchanged resolved to null and the delete silently did
      // nothing. Hand it the tmdb id explicitly.
      if (item) toggleFavorite({ ...item, id: item.tmdb_id });
    });
    exitEditMode();
  };

  return (
    <CollapsibleSection
      id="favorites"
      label={fw.plural}
      count={visible.length}
      open={open}
      onOpenChange={onOpenChange}
      headerRight={
        <>
          {editMode && selected.size > 0 && (
            <button
              className="date-group-action-btn date-group-action-btn--plain"
              type="button"
              aria-label={`Delete ${selected.size} selected`}
              title={`Delete ${selected.size} selected`}
              onClick={deleteSelected}
              style={{ color: '#ef4444' }}
            >
              <TrashIcon />
            </button>
          )}
          {editMode ? (
            <button
              className="date-group-action-btn date-group-action-btn--plain"
              type="button"
              aria-label="Done selecting"
              title="Done selecting"
              onClick={exitEditMode}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Done</span>
            </button>
          ) : visible.length > 0 && (
            <KebabMenu ariaLabel={`${fw.plural} options`} items={[{ label: 'Select', onClick: () => setEditMode(true) }]} />
          )}
          <button
            className="date-group-action-btn date-group-action-btn--plain"
            type="button"
            aria-label={`Add ${fw.nounLower}`}
            title={`Add ${fw.nounLower}`}
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon />
          </button>
        </>
      }
    >
      {favorites.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
            Heart anything to add it here
          </div>
          <button
            className="empty-add-btn"
            type="button"
            aria-label={`Add ${fw.nounLower}`}
            title={`Add ${fw.nounLower}`}
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon />
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: '1.5rem 1rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          No {fw.pluralLower} match the current filters
        </div>
      ) : (
        <PosterGrid
          items={visible}
          openPanel={openPanel}
          editMode={editMode}
          selectedIds={selected}
          onToggleSelect={toggleSelect}
        />
      )}

      {showAdd && (
        <AddToFavoritesModal
          title={`Add to ${fw.plural}`}
          onAdd={(item) => {
            if (!isFavorite(item.id || item.tmdb_id)) toggleFavorite(item);
          }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </CollapsibleSection>
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
        setError(MEDIA.couldNotCreateList);
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
          <button className="btn btn-ghost btn-sm" disabled={isSubmitting} onClick={onClose}>{COMMON.cancel}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Custom lists section ── */
function CustomListsSection({ customLists: clHook, filterItems, open, onOpenChange }) {
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
  const [editListId,   setEditListId]   = useState(null);
  const [selectedByList, setSelectedByList] = useState({});

  const toggleList = (id) => setOpenItems(prev => ({ ...prev, [id]: !(prev[id] ?? true) }));
  const isOpen = (id) => openItems[id] ?? true;

  const toggleSelect = (listId, tmdbId) => {
    setSelectedByList(prev => {
      const next = new Set(prev[listId]);
      if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
      return { ...prev, [listId]: next };
    });
  };

  const exitEditMode = () => setEditListId(null);

  const deleteSelected = (listId) => {
    const selected = selectedByList[listId];
    if (selected) selected.forEach(tmdbId => removeItem(listId, tmdbId));
    setSelectedByList(prev => ({ ...prev, [listId]: new Set() }));
    setEditListId(null);
  };

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
    <CollapsibleSection
      id="lists"
      label="My Lists"
      count={lists.length}
      open={open}
      onOpenChange={onOpenChange}
      headerRight={
        <button
          className="date-group-action-btn date-group-action-btn--plain"
          type="button"
          aria-label="Create new list"
          title="Create new list"
          onClick={requestCreate}
        >
          <PlusIcon />
        </button>
      }
    >
      {showCapNotice && (
        <div style={{
          margin: '0.5rem 1rem', padding: '0.65rem 0.85rem',
          fontSize: '0.78rem', lineHeight: 1.45,
          color: 'var(--text-secondary)', background: 'var(--surface)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
        }}>
          You&rsquo;ve got {FREE_CUSTOM_LIST_CAP} lists. PLOT Premium gets unlimited.{' '}
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

            {editListId === list.id && (selectedByList[list.id]?.size ?? 0) > 0 && (
              <button
                className="date-group-action-btn date-group-action-btn--plain"
                type="button"
                aria-label={`Delete ${selectedByList[list.id].size} selected`}
                title={`Delete ${selectedByList[list.id].size} selected`}
                onClick={() => deleteSelected(list.id)}
                style={{ color: '#ef4444' }}
              >
                <TrashIcon />
              </button>
            )}
            {editListId === list.id && (
              <button
                className="date-group-action-btn date-group-action-btn--plain"
                type="button"
                aria-label="Done selecting"
                title="Done selecting"
                onClick={exitEditMode}
              >
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{COMMON.done}</span>
              </button>
            )}

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
                    {(list.items || []).length > 0 && (
                      <button
                        style={{ display: 'block', width: '100%', padding: '0.6rem 0.8rem', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: '0.8rem', color: 'var(--text-primary)' }}
                        onClick={() => {
                          setEditListId(list.id);
                          setMenuOpen(null);
                        }}
                        aria-label={`Select items in ${list.name}`}
                      >
                        Select
                      </button>
                    )}
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
                      {list.is_public ? COMMON.makePrivate : 'Make public'}
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
              <button className="btn btn-primary btn-xs" onClick={() => handleRename(list.id)}>{COMMON.save}</button>
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
                editMode={editListId === list.id}
                selectedIds={selectedByList[list.id]}
                onToggleSelect={(tmdbId) => toggleSelect(list.id, tmdbId)}
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
    </CollapsibleSection>
  );
}

/* ── Currently-watching section ── */
function WatchingSection({ watching, open, onOpenChange }) {
  const { openPanel } = useApp();
  const items = watching.items || [];
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const toggleSelect = (tmdbId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
      return next;
    });
  };
  const exitEditMode = () => { setEditMode(false); setSelected(new Set()); };
  const deleteSelected = () => {
    selected.forEach(tmdbId => watching.stopWatching(tmdbId));
    exitEditMode();
  };

  // Episode count for each show's current season, keyed by tmdb_id — the
  // denominator for the progress bar. It isn't stored on the row, so pull it
  // from TMDB via the hook's ref-cached fetchSeason (one network call per
  // show/season for the whole session; re-runs only when the list or a
  // current-season changes).
  const [epCounts, setEpCounts] = useState({});
  const seasonKey = items.map(i => `${i.tmdb_id}:${i.current_season}`).join(',');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(items.map(async (item) => {
        const season = await watching.fetchSeason(item.tmdb_id, item.current_season);
        return [item.tmdb_id, season?.episodes?.length || 0];
      }));
      if (!cancelled) setEpCounts(Object.fromEntries(entries));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on seasonKey; `watching`/`items` identity churns each render
  }, [seasonKey]);

  return (
    <CollapsibleSection
      id="watching"
      label="Watching"
      count={items.length}
      open={open}
      onOpenChange={onOpenChange}
      headerRight={
        <>
          {editMode && selected.size > 0 && (
            <button
              className="date-group-action-btn date-group-action-btn--plain"
              type="button"
              aria-label={`Stop watching ${selected.size} selected`}
              title={`Stop watching ${selected.size} selected`}
              onClick={deleteSelected}
              style={{ color: '#ef4444' }}
            >
              <TrashIcon />
            </button>
          )}
          {editMode ? (
            <button
              className="date-group-action-btn date-group-action-btn--plain"
              type="button"
              aria-label="Done selecting"
              title="Done selecting"
              onClick={exitEditMode}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Done</span>
            </button>
          ) : items.length > 0 && (
            <KebabMenu ariaLabel="Watching options" items={[{ label: 'Select', onClick: () => setEditMode(true) }]} />
          )}
        </>
      }
    >
      {items.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Not watching anything yet</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Start a series from Want to Watch or from Search
          </div>
        </div>
      ) : items.map(item => {
        const img    = posterUrl(item.poster_path, 'w92');
        const epCode = `S${String(item.current_season).padStart(2,'0')}E${String(item.current_episode).padStart(2,'0')}`;
        // Episodes in the current season (fetched above; total_episodes on the row
        // is a legacy fallback). Only draw the bar once we know the denominator.
        const total = epCounts[item.tmdb_id] || item.total_episodes || 0;
        const pct   = total ? Math.min(100, Math.round((item.current_episode / total) * 100)) : null;
        const isSelected = selected.has(item.tmdb_id);
        const openDetails = () => {
          if (editMode) toggleSelect(item.tmdb_id);
          else openPanel(item.tmdb_id, 'tv');
        };
        return (
          <div
            key={item.tmdb_id}
            className="list-row interactive-surface"
            onClick={openDetails}
            {...getButtonLikeProps({ onPress: openDetails, label: editMode ? `${isSelected ? 'Deselect' : 'Select'} ${item.title}` : `View details for ${item.title}` })}
          >
            <div className="list-row-poster">
              {img && <img src={img} alt={item.title} />}
              {editMode && (
                <SelectCircle
                  variant="row"
                  selected={isSelected}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(item.tmdb_id); }}
                  label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
                />
              )}
            </div>
            <div className="list-row-info">
              <div className="list-row-title">{item.title}</div>
              <div className="list-row-meta">
                <span>
                  Season {item.current_season} · Episode {item.current_episode}
                  {total ? ` of ${total}` : ''}
                </span>
              </div>
              {pct != null && (
                <div className="list-row-progress">
                  <span style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
            <div className="list-row-end mylists-row-status">
              <span className="chip chip-episode">{epCode}</span>
            </div>
          </div>
        );
      })}
    </CollapsibleSection>
  );
}

/* ── Want to watch section ── */
function WantToWatchSection({ watchlist, watching, open, onOpenChange }) {
  const { openPanel } = useApp();
  const todayStr = localDateStr();
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());

  const watchingIds = new Set((watching.items || []).map(i => i.tmdb_id));
  const saved = (watchlist.items || []).filter(i => !watchingIds.has(Number(i.tmdb_id)));

  const comingSoon   = saved.filter(i => i.release_date && i.release_date > todayStr)
    .sort((a, b) => a.release_date.localeCompare(b.release_date));
  const availableNow = saved.filter(i => !i.release_date || i.release_date <= todayStr);
  const sorted = [...comingSoon, ...availableNow];

  const toggleSelect = (tmdbId) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
      return next;
    });
  };
  const exitEditMode = () => { setEditMode(false); setSelected(new Set()); };
  const deleteSelected = () => {
    selected.forEach(tmdbId => watchlist.removeFromList(tmdbId));
    exitEditMode();
  };

  return (
    <CollapsibleSection
      id="want"
      label="Want to Watch"
      count={sorted.length}
      open={open}
      onOpenChange={onOpenChange}
      headerRight={
        <>
          {editMode && selected.size > 0 && (
            <button
              className="date-group-action-btn date-group-action-btn--plain"
              type="button"
              aria-label={`Remove ${selected.size} selected`}
              title={`Remove ${selected.size} selected`}
              onClick={deleteSelected}
              style={{ color: '#ef4444' }}
            >
              <TrashIcon />
            </button>
          )}
          {editMode ? (
            <button
              className="date-group-action-btn date-group-action-btn--plain"
              type="button"
              aria-label="Done selecting"
              title="Done selecting"
              onClick={exitEditMode}
            >
              <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Done</span>
            </button>
          ) : sorted.length > 0 && (
            <KebabMenu ariaLabel="Want to Watch options" items={[{ label: 'Select', onClick: () => setEditMode(true) }]} />
          )}
        </>
      }
    >
      {sorted.length === 0 ? (
        <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Nothing saved yet</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Tap the bookmark on any title to save it here
          </div>
        </div>
      ) : sorted.map(item => {
        const img           = posterUrl(item.poster_path, 'w92');
        const title         = item.title || item.name || 'Unknown';
        const isTV          = item.media_type === 'tv';
        const chip          = item.release_date ? countdownChip(item.release_date) : null;
        const streamingChip = item.streaming_date ? countdownChip(item.streaming_date) : null;
        const isSelected = selected.has(item.tmdb_id);
        const openDetails = () => {
          if (editMode) toggleSelect(item.tmdb_id);
          else openPanel(item.tmdb_id, item.media_type || 'movie');
        };

        return (
          <div
            key={item.id}
            className="list-row interactive-surface"
            onClick={openDetails}
            {...getButtonLikeProps({ onPress: openDetails, label: editMode ? `${isSelected ? 'Deselect' : 'Select'} ${title}` : `View details for ${title}` })}
          >
            <div className="list-row-poster">
              {img && <img src={img} alt={title} />}
              {editMode && (
                <SelectCircle
                  variant="row"
                  selected={isSelected}
                  onClick={(e) => { e.stopPropagation(); toggleSelect(item.tmdb_id); }}
                  label={isSelected ? `Deselect ${title}` : `Select ${title}`}
                />
              )}
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
    </CollapsibleSection>
  );
}

/* ── History row ── */
function HistoryRow({ entry, openPanel }) {
  const [expanded, setExpanded] = useState(false);
  const img   = posterUrl(entry.poster_path, 'w92');
  const title = entry.title || 'Unknown';
  const date  = entry.watched_at
    ? new Date(entry.watched_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';
  const ratingLabel = historyRatingLabel(entry.rating);
  const openDetails = () => openPanel(entry.tmdb_id, entry.media_type || 'movie');
  const hasNote = !!entry.note;

  return (
    <div
      className="list-row history-list-row interactive-surface"
      onClick={openDetails}
      {...getButtonLikeProps({ onPress: openDetails, label: `View details for ${title}` })}
    >
      <div className="list-row-poster">
        {img && <img src={img} alt={title} />}
      </div>
      <div className="list-row-info">
        <div className="list-row-title">{title}</div>
        <div className="list-row-meta">
          {date && <span>{date}</span>}
          {ratingLabel && <span className="history-row-rating">{ratingLabel}</span>}
        </div>
      </div>
      {hasNote && (
        <button
          type="button"
          className="history-row-toggle"
          aria-expanded={expanded}
          aria-label={expanded ? `Hide review for ${title}` : `Show review for ${title}`}
          onClick={(e) => { e.stopPropagation(); setExpanded(v => !v); }}
        >
          <svg className={`collapse-chevron${expanded ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
      {hasNote && (
        <div className={`collapse-body${expanded ? '' : ' collapsed'}`}>
          <div className="collapse-body-inner">
            <div className="history-row-quote">{entry.note}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── One month's worth of history, independently collapsible. `expandSignal`
   mirrors GuideView's DateGroup pattern: a new {token, open} forces this
   group open/closed from the toolbar's expand/collapse-all button, without
   the parent needing to track every dynamically-created month's state. ── */
function useSignalledOpen(expandSignal, defaultOpen) {
  const [open, setOpen] = useState(defaultOpen);
  const initialToken = useRef(expandSignal?.token);
  useEffect(() => {
    if (!expandSignal || expandSignal.token === initialToken.current) return;
    setOpen(expandSignal.open);
  }, [expandSignal]);
  return [open, setOpen];
}

function HistoryMonthGroup({ year, month, entries, expandSignal }) {
  const { openPanel } = useApp();
  const [open, setOpen] = useSignalledOpen(expandSignal, true);

  return (
    <CollapsibleSection
      id={`history-${year}-${month}`}
      label={monthLabel(year, month)}
      count={entries.length}
      open={open}
      onOpenChange={setOpen}
    >
      {entries.map(entry => (
        <HistoryRow key={entry.id} entry={entry} openPanel={openPanel} />
      ))}
    </CollapsibleSection>
  );
}

/* ── History section: every month with activity, newest first ── */
function HistorySection({ groups, loading, hasAnyEntries, expandSignal }) {
  if (loading) return <LoadingSpinner />;

  if (!hasAnyEntries) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Nothing watched yet</div>
        <div className="empty-body">
          Your watch history will appear here. Search for a title and mark it as watched to get started.
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">No matches</div>
        <div className="empty-body">No history matches the current filters.</div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: '2rem' }}>
      {groups.map(g => (
        <HistoryMonthGroup key={g.key} year={g.year} month={g.month} entries={g.entries} expandSignal={expandSignal} />
      ))}
    </div>
  );
}

/* ── Main view ── */
export default function MyListsView() {
  const { user, profile, topLists, favorites, customLists, watching, watchlist } = useApp();
  const fw = favoriteWords(profile?.region);
  const location = useLocation();
  const { entries: historyEntries, loading: historyLoading } = useHistory(user?.id);

  const [tab,          setTab]          = useState(location.state?.tab || 'all');
  const [typeFilters,  setTypeFilters]  = useState([]);
  const [listSectionsOpen, setListSectionsOpen] = useState(() => Object.fromEntries(
    ALL_LIST_SECTION_IDS.map(id => [id, getStoredSectionOpen(id)]),
  ));

  const today = useMemo(() => new Date(), []);

  const filterItems = useCallback((items) => {
    if (!typeFilters.length) return items;
    return items.filter(i =>
      (typeFilters.includes('tv') && i.media_type === 'tv') ||
      (typeFilters.includes('cinema') && i._cinema === true) ||
      (typeFilters.includes('movie') && i.media_type === 'movie' && !i._cinema)
    );
  }, [typeFilters]);

  // History shows every month at once, newest first, skipping any month
  // with nothing in it. `historyYear`/`historyMonth` no longer select what's
  // rendered — they're just which month the nav widget last jumped to.
  const historyMonthGroups = useMemo(
    () => groupEntriesByMonth(filterItems(historyEntries)),
    [historyEntries, filterItems],
  );
  const hasAnyHistoryEntries = historyEntries.length > 0;

  const [historyYear,  setHistoryYear]  = useState(today.getFullYear());
  const [historyMonth, setHistoryMonth] = useState(today.getMonth());
  const [historyGroupsOpen,   setHistoryGroupsOpen]   = useState(true);
  const [historyExpandSignal, setHistoryExpandSignal] = useState(null);

  const scrollToHistoryMonth = (year, month) => {
    document.getElementById(`history-${year}-${month}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const historyGroupIndex = historyMonthGroups.findIndex(g => g.year === historyYear && g.month === historyMonth);
  const canGoOlderHistoryMonth = historyGroupIndex === -1 ? historyMonthGroups.length > 0 : historyGroupIndex < historyMonthGroups.length - 1;
  const canGoNewerHistoryMonth = historyGroupIndex > 0;
  const hasCurrentHistoryMonth = historyMonthGroups.some(g => g.year === today.getFullYear() && g.month === today.getMonth());

  const prevHistoryMonth = () => {
    if (!canGoOlderHistoryMonth) return;
    const target = historyGroupIndex === -1 ? historyMonthGroups[0] : historyMonthGroups[historyGroupIndex + 1];
    setHistoryYear(target.year);
    setHistoryMonth(target.month);
    scrollToHistoryMonth(target.year, target.month);
  };
  const nextHistoryMonth = () => {
    if (!canGoNewerHistoryMonth) return;
    const target = historyMonthGroups[historyGroupIndex - 1];
    setHistoryYear(target.year);
    setHistoryMonth(target.month);
    scrollToHistoryMonth(target.year, target.month);
  };
  const goToHistoryToday = () => {
    setHistoryYear(today.getFullYear());
    setHistoryMonth(today.getMonth());
    scrollToHistoryMonth(today.getFullYear(), today.getMonth());
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
    { id: 'favorites', label: fw.plural        },
    { id: 'lists',     label: 'Lists'         },
    { id: 'history',   label: 'History'       },
  ];

  const isAll       = tab === 'all';
  const isHistory   = tab === 'history';
  const showWatching = isAll || tab === 'watching';
  const showWant     = isAll || tab === 'want';
  const showTop10    = isAll || tab === 'top10';
  const showFavs     = isAll || tab === 'favorites';
  const showLists    = isAll || tab === 'lists';

  // Expand/collapse-all acts on every section on the "All" tab, every month
  // group on the History tab, or just the one section relevant to whichever
  // other single tab is active (tab ids match section ids 1:1 there).
  const relevantSectionIds = isAll ? ALL_LIST_SECTION_IDS : [tab];
  const sectionsOpenForView = isHistory
    ? historyGroupsOpen
    : relevantSectionIds.every(id => listSectionsOpen[id]);
  const setListSectionOpen = (id, open) => {
    setListSectionsOpen(prev => ({ ...prev, [id]: open }));
  };
  const toggleSectionsForView = () => {
    const next = !sectionsOpenForView;
    if (isHistory) {
      setHistoryGroupsOpen(next);
      setHistoryExpandSignal(prev => ({ token: (prev?.token ?? 0) + 1, open: next }));
      return;
    }
    setListSectionsOpen(prev => ({ ...prev, ...Object.fromEntries(relevantSectionIds.map(id => [id, next])) }));
    relevantSectionIds.forEach(id => storeSectionOpen(id, next));
  };
  const sectionsToggleLabel = (isAll || isHistory)
    ? (sectionsOpenForView ? MEDIA.collapseAllSections : MEDIA.expandAllSections)
    : (sectionsOpenForView ? 'Collapse section' : 'Expand section');

  return (
    <div style={{ paddingBottom: '2rem' }}>
      <div className="sub-tabs">
        {isHistory && (
          <span className="sub-tabs-date">
            <TodayLabel onClick={hasCurrentHistoryMonth ? goToHistoryToday : undefined} />
          </span>
        )}
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
            ]}
          />
          <button
            className="section-expand-all-btn"
            onClick={toggleSectionsForView}
            aria-label={sectionsToggleLabel}
            aria-pressed={sectionsOpenForView}
            title={sectionsToggleLabel}
            type="button"
          >
            <SectionToggleIcon collapse={sectionsOpenForView} />
          </button>
          {isHistory && historyMonthGroups.length > 0 && (
            <div className="cal-month-nav">
              <button className="cal-month-btn" onClick={prevHistoryMonth} disabled={!canGoOlderHistoryMonth} aria-label="Jump to an older month">
                <svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>
              </button>
              <span className="cal-month-nav-label">{monthLabel(historyYear, historyMonth, 'short')}</span>
              <button className="cal-month-btn" onClick={nextHistoryMonth} disabled={!canGoNewerHistoryMonth} aria-label="Jump to a more recent month">
                <svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Watching ── */}
      {showWatching && (
        <WatchingSection
          watching={watching}
          open={listSectionsOpen.watching}
          onOpenChange={open => setListSectionOpen('watching', open)}
        />
      )}

      {/* ── Want to Watch ── */}
      {showWant && (
        <WantToWatchSection
          watchlist={watchlist}
          watching={watching}
          open={listSectionsOpen.want}
          onOpenChange={open => setListSectionOpen('want', open)}
        />
      )}

      {/* ── Top 10 (keeps a banner on its own tab too) ── */}
      {showTop10 && (
        <CollapsibleSection id="top10" label="Top 10" open={listSectionsOpen.top10} onOpenChange={open => setListSectionOpen('top10', open)}>
          {(typeFilters.length === 0 || typeFilters.includes('movie')) && (
            <TopTenSection listType="movies" title="Movies" topLists={topLists} />
          )}
          {(typeFilters.length === 0 || typeFilters.includes('tv')) && (
            <TopTenSection listType="tv" title="TV Shows" topLists={topLists} />
          )}
        </CollapsibleSection>
      )}

      {/* ── Favorites ── */}
      {showFavs && (
        <FavoritesSection
          favorites={favorites}
          filterItems={filterItems}
          open={listSectionsOpen.favorites}
          onOpenChange={open => setListSectionOpen('favorites', open)}
        />
      )}

      {/* ── My Lists ── */}
      {showLists && (
        <CustomListsSection
          customLists={customLists}
          filterItems={filterItems}
          open={listSectionsOpen.lists}
          onOpenChange={open => setListSectionOpen('lists', open)}
        />
      )}

      {/* ── History ── */}
      {isHistory && (
        <HistorySection
          groups={historyMonthGroups}
          loading={historyLoading}
          hasAnyEntries={hasAnyHistoryEntries}
          expandSignal={historyExpandSignal}
        />
      )}
    </div>
  );
}
