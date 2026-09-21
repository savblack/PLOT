import PrivateNote from './PrivateNote.jsx';
import { customListCreationError } from '@plot/core/customListCreation.js';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../hooks/useApp.js';
import { countdownChip } from '../utils/countdown.js';
import { posterUrl } from '../utils/images.js';
import { tmdb } from '@plot/core/tmdb.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { useHistory } from '../hooks/useHistory.js';
import { favoriteWords } from '../utils/spelling.js';
import { COMMON } from '../copy/common.js';
import KebabMenu from './KebabMenu.jsx';
import { useSelection } from '../hooks/useSelection.js';
import ConfirmModal from './ConfirmModal.jsx';
import PlotLoader from '@plot/ui/PlotLoader.jsx';
import SheetHeader from './SheetHeader.jsx';
import { DiscoverSectionHeader } from './DiscoverView.jsx';
import { filterByTypeAndGenre } from '@plot/core/mediaFilters.js';
import { CardGrid, ListCard, SelectCircle } from './ListCards.jsx';
import { MEDIA } from '../copy/media.js';
import { TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { privateNoteKey } from '@plot/core/privateNotes.js';

/* The lists themselves: one component per list, each rendering into a
   `Frame` it is handed. On My Lists the frame is a section on the page (the
   Watching shelf); on a list's own page it is the cover header. The list
   owns its selection state and hands the frame its header actions, so the
   trash / Done pair sits beside the title wherever the list is shown. */

export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function TickIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>;
}

/* ── Search sheet for Top 5 additions ── */
export function AddToRankModal({ listType, rank, onAdd, onClose }) {
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
      const data = await tmdb.searchTitles(query, { mediaType: mediaFilter });
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

/* ── Search sheet for Favourites and custom-list additions ── */
export function AddToFavoritesModal({ title = 'Add to Favorites', onAdd, onClose }) {
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
      const data = await tmdb.searchTitles(query);
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

/* ── Create list sheet ── */
export function CreateListModal({ lists, onConfirm, onClose }) {
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
    } catch (failure) {
      setError(customListCreationError(failure, MEDIA.couldNotCreateList));
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
          <div style={{ marginBottom: '0.75rem', color: 'var(--danger)', fontSize: '0.75rem' }}>
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

/* ── Shared section chrome ── */

export function ListSection({ title, subtitle, headerRight, children }) {
  return (
    <section className="discover-section">
      <DiscoverSectionHeader title={title} subtitle={subtitle} headerRight={headerRight} />
      {children}
    </section>
  );
}

/* A quiet one-liner where a list has nothing in it yet. The old empty states
   were centred blocks a hundred pixels tall; a list with nothing in it should
   not take more room than a list with something in it. */
export function Empty({ children, onAdd, addLabel }) {
  return (
    <p className="mylists-empty">
      {children}
      {onAdd && (
        <button className="mylists-empty-add" type="button" aria-label={addLabel} title={addLabel} onClick={onAdd}>
          <PlusIcon />
        </button>
      )}
    </p>
  );
}

/* Header label + count + actions for a block inside a section (one Top 5
   list, one custom list). */
export function SubHead({ label, count, badge, children }) {
  return (
    <div className="mylists-sub-head">
      <span className="mylists-sub-label">{label}</span>
      {count != null && <span className="mylists-sub-count">{count}</span>}
      {badge}
      <div className="mylists-sub-actions">{children}</div>
    </div>
  );
}

export function HeaderIconButton({ label, onClick, danger = false, success = false, children }) {
  return (
    <button
      className={`date-group-action-btn date-group-action-btn--plain${success ? ' date-group-action-btn--success' : ''}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      style={danger ? { color: 'var(--danger)' } : undefined}
    >
      {children}
    </button>
  );
}

/* The kebab that starts selecting, or the trash + Done pair while selecting. */
export function SelectControls({ selection, hasItems, menuLabel, deleteLabel, onDelete, extraItems = [] }) {
  const { editMode, selected, start, exit } = selection;
  if (editMode) {
    return (
      <>
        {selected.size > 0 && (
          <HeaderIconButton label={`${deleteLabel} ${selected.size} selected`} onClick={onDelete} danger>
            <TrashIcon />
          </HeaderIconButton>
        )}
        <HeaderIconButton label="Done selecting" onClick={exit} success>
          <TickIcon />
        </HeaderIconButton>
      </>
    );
  }
  const items = [...(hasItems ? [{ label: COMMON.select, onClick: start }] : []), ...extraItems];
  if (items.length === 0) return null;
  return <KebabMenu ariaLabel={menuLabel} items={items} />;
}

/* ── Watching ── */
export function WatchingSection({ watching, hidden, Frame = ListSection }) {
  const { openPanel } = useApp();
  const items = watching.items || [];
  const selection = useSelection();

  // Episode count for each show's current season, keyed by tmdb_id: the
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

  if (hidden) return null;

  const stopSelected = () => {
    selection.selected.forEach(tmdbId => watching.stopWatching(tmdbId));
    selection.exit();
  };

  return (
    <Frame
      title="Watching"
      headerRight={
        <SelectControls
          selection={selection}
          hasItems={items.length > 0}
          menuLabel="Watching options"
          deleteLabel={MEDIA.stopWatching}
          onDelete={stopSelected}
        />
      }
    >
      {items.length === 0 ? (
        <Empty>Not watching anything yet. Start a series from Want to Watch or from Search.</Empty>
      ) : (
        <CardGrid>
          {items.map(item => {
            // Episodes in the current season (fetched above; total_episodes on
            // the row is a legacy fallback). Only draw the bar once the
            // denominator is known.
            const total  = epCounts[item.tmdb_id] || item.total_episodes || 0;
            const pct    = total ? Math.min(100, Math.round((item.current_episode / total) * 100)) : null;
            const season = `S${String(item.current_season).padStart(2, '0')}`;
            const meta   = total
              ? `${season} · Ep ${item.current_episode} of ${total}`
              : `${season}E${String(item.current_episode).padStart(2, '0')}`;
            return (
              <ListCard
                key={item.tmdb_id}
                title={item.title}
                img={posterUrl(item.poster_path, 'w185')}
                meta={meta}
                progress={pct}
                onOpen={() => openPanel(item.tmdb_id, 'tv')}
                editMode={selection.editMode}
                selected={selection.selected.has(item.tmdb_id)}
                onToggleSelect={() => selection.toggle(item.tmdb_id)}
              />
            );
          })}
        </CardGrid>
      )}
    </Frame>
  );
}

/* ── Want to Watch ── */
function wantMeta(item) {
  const parts = [item.media_type === 'tv' ? MEDIA.series : MEDIA.movie];
  const release = item.release_date ? countdownChip(item.release_date) : null;
  // "Released" is the normal case; only an upcoming date is worth a word.
  if (release && release.label !== 'Released') parts.push(release.label);
  const streaming = item.streaming_date ? countdownChip(item.streaming_date) : null;
  if (streaming && streaming.label !== 'Released') parts.push(`Streaming ${streaming.label.toLowerCase()}`);
  return parts.join(' · ');
}

function cardState(item, historyEntries, privateNotes) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  return {
    hasPrivateNote: !!privateNotes?.rows?.[privateNoteKey(id, type)]?.note,
    hasReview: historyEntries?.some(entry => entry.tmdb_id === id && entry.media_type === type && !!entry.note) || false,
  };
}

function cardActions(item, favorites, watchlist, fw) {
  const id = Number(item.tmdb_id);
  const type = item.media_type || 'movie';
  const normalized = { ...item, id, tmdb_id: id, media_type: type };
  const isFavorite = favorites.isFavorite(id);
  const isBookmarked = watchlist.isInList(id);
  return {
    isFavorite,
    isBookmarked,
    favoriteLabel: isFavorite ? `Remove ${item.title || item.name} from ${fw.pluralLower}` : `Add ${item.title || item.name} to ${fw.pluralLower}`,
    bookmarkLabel: isBookmarked ? MEDIA.removeFromWatchlist : MEDIA.saveToWatchlist,
    onToggleFavorite: () => favorites.toggleFavorite(normalized),
    onToggleBookmark: () => watchlist.toggle(normalized),
  };
}

function ListPageRow({ item, title, meta, open, selection, note }) {
  return (
    <div className="list-page-row">
      <button type="button" className="list-page-row-poster" onClick={open} aria-label={title}>{item.poster_path && <img src={posterUrl(item.poster_path, 'w185')} alt="" loading="lazy" />}</button>
      <div className="list-page-row-copy">
        <button type="button" className="list-page-row-title" onClick={open}>{title}</button>
        <div className="list-page-row-meta">{meta}</div>
        {note}
      </div>
      {selection.editMode && <SelectCircle variant="row" selected={selection.selected.has(item.tmdb_id)} onClick={open} label={`Select ${title}`} />}
    </div>
  );
}

export function WantToWatchSection({ items, count = items.length, narrowed, Frame = ListSection, pageLayout = false, historyEntries = [] }) {
  const { openPanel, watchlist, privateNotes, favorites, profile } = useApp();
  const fw = favoriteWords(profile?.region);
  const selection = useSelection();
  const [showAdd, setShowAdd] = useState(false);

  if (narrowed && items.length === 0) return null;

  const removeSelected = () => {
    selection.selected.forEach(tmdbId => watchlist.removeFromList(tmdbId));
    selection.exit();
  };

  return (
    <Frame
      title="Want to Watch"
      count={count}
      headerRight={
        <>
          {pageLayout && (
            <HeaderIconButton label="Add to Want to Watch" onClick={() => setShowAdd(true)}>
              <PlusIcon />
            </HeaderIconButton>
          )}
          <SelectControls
            selection={selection}
            hasItems={items.length > 0}
            menuLabel="Want to Watch options"
            deleteLabel="Remove"
            onDelete={removeSelected}
          />
        </>
      }
    >
      {items.length === 0 ? (
        <Empty>Nothing saved yet. Tap the bookmark on any title to save it here.</Empty>
      ) : (
        <div className={pageLayout ? 'list-page-items' : ''}>
          {pageLayout && <CardGrid>{items.map(item => {
            const title = item.title || item.name || MEDIA.unknown;
            const type = item.media_type || 'movie';
            return <ListCard key={`${type}:${item.tmdb_id}`} title={title} img={posterUrl(item.poster_path, 'w185')} meta={wantMeta(item)} {...cardState(item, historyEntries, privateNotes)} {...cardActions(item, favorites, watchlist, fw)} onOpen={() => openPanel(item.tmdb_id, type)} editMode={selection.editMode} selected={selection.selected.has(item.tmdb_id)} onToggleSelect={() => selection.toggle(item.tmdb_id)} />;
          })}</CardGrid>}
          <div className="private-watchlist">
            {items.map(item => {
            const title = item.title || item.name || MEDIA.unknown;
            const type = item.media_type || 'movie';
            const open = () => selection.editMode ? selection.toggle(item.tmdb_id) : openPanel(item.tmdb_id, type);
            return pageLayout ? (
              <ListPageRow key={`${type}:${item.tmdb_id}`} item={item} title={title} meta={wantMeta(item)} open={open} selection={selection} note={!selection.editMode && <PrivateNote id={item.tmdb_id} type={type} title={title} />} />
            ) : (
              <div className="private-watchlist-row" key={`${type}:${item.tmdb_id}`}>
                <button type="button" className="private-watchlist-poster" onClick={open} aria-label={title}>
                  {item.poster_path && <img src={posterUrl(item.poster_path, 'w185')} alt="" loading="lazy" />}
                </button>
                <div className="private-watchlist-body">
                  <button type="button" className="private-watchlist-title" onClick={open}>{title}</button>
                  <div className="mylists-card-meta">{wantMeta(item)}</div>
                  {!selection.editMode && <PrivateNote id={item.tmdb_id} type={type} title={title} />}
                </div>
                {selection.editMode && <SelectCircle selected={selection.selected.has(item.tmdb_id)} onClick={open} label={`Select ${title}`} />}
              </div>
            );
          })}
          </div>
        </div>
      )}
      {showAdd && (
        <AddToFavoritesModal title="Add to Want to Watch" onAdd={(item) => watchlist.addToList(item)} onClose={() => setShowAdd(false)} />
      )}
    </Frame>
  );
}

/* ── Favourites ── */
export function FavoritesSection({ favorites: favsHook, visibleItems, count, typeFilters, genreFilters = [], narrowed, Frame = ListSection, pageLayout = false, historyEntries = [] }) {
  const { openPanel, profile, watchlist, privateNotes } = useApp();
  const fw = favoriteWords(profile?.region);
  const [showAdd, setShowAdd] = useState(false);
  const selection = useSelection();
  const { favorites, isFavorite, toggleFavorite } = favsHook;

  const visible = visibleItems ?? filterByTypeAndGenre(favorites, typeFilters, genreFilters);
  if (narrowed && visible.length === 0) return null;

  const deleteSelected = () => {
    selection.selected.forEach(tmdbId => {
      const item = favorites.find(f => f.tmdb_id === tmdbId);
      // toggleFavorite resolves the id via tmdbIdFromItem, which reads `id`
      // before `tmdb_id`: right for a TMDB result, wrong for a row out of
      // user_favourites whose `id` is the row's uuid. Hand it the tmdb id.
      if (item) toggleFavorite({ ...item, id: item.tmdb_id });
    });
    selection.exit();
  };

  return (
    <Frame
      title={fw.plural}
      count={count ?? favorites.length}
      headerRight={
        <>
          <HeaderIconButton label={`Add ${fw.nounLower}`} onClick={() => setShowAdd(true)}>
            <PlusIcon />
          </HeaderIconButton>
          <SelectControls
            selection={selection}
            hasItems={visible.length > 0}
            menuLabel={`${fw.plural} options`}
            deleteLabel="Remove"
            onDelete={deleteSelected}
          />
        </>
      }
    >
      {favorites.length === 0 ? (
        <Empty>Heart anything to add it here.</Empty>
      ) : (
        <div className={pageLayout ? 'list-page-items' : ''}>
        <CardGrid>
          {visible.map(item => {
            const title = item.title || MEDIA.unknown;
            return (
              <ListCard
                key={item.id}
                title={title}
                img={posterUrl(item.poster_path, 'w185')}
                meta={item.media_type === 'tv' ? MEDIA.series : MEDIA.movie}
                {...(pageLayout ? cardState(item, historyEntries, privateNotes) : {})}
                {...(pageLayout ? cardActions(item, favsHook, watchlist, fw) : {})}
                onOpen={() => openPanel(item.tmdb_id, item.media_type)}
                editMode={selection.editMode}
                selected={selection.selected.has(item.tmdb_id)}
                onToggleSelect={() => selection.toggle(item.tmdb_id)}
              />
            );
          })}
        </CardGrid>
        {pageLayout && <div className="list-page-rows">{visible.map(item => {
          const title = item.title || MEDIA.unknown;
          const open = () => selection.editMode ? selection.toggle(item.tmdb_id) : openPanel(item.tmdb_id, item.media_type);
          return <ListPageRow key={`row:${item.id}`} item={item} title={title} meta={item.media_type === 'tv' ? MEDIA.series : MEDIA.movie} open={open} selection={selection} />;
        })}</div>}
        </div>
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
    </Frame>
  );
}


/* ── One custom list, as a page: grid plus rename / public / share / delete ── */
export function CustomListSection({ list, visibleItems, count, customLists, typeFilters, genreFilters = [], narrowed, share, shareCopied = false, onDeleted, Frame = ListSection, pageLayout = false, historyEntries = [] }) {
  const { openPanel, favorites, watchlist, privateNotes, profile } = useApp();
  const fw = favoriteWords(profile?.region);
  const { renameList, setListPublic, addItem, removeItem, deleteList } = customLists;
  const selection = useSelection();
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list.name);
  const [showAdd, setShowAdd] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const allItems = list.items || [];
  const visible  = visibleItems ?? filterByTypeAndGenre(allItems, typeFilters, genreFilters);

  const submitRename = async () => {
    if (!renameValue.trim()) return;
    const ok = await renameList(list.id, renameValue);
    if (ok) setRenaming(false);
  };
  const removeSelected = () => {
    selection.selected.forEach(tmdbId => removeItem(list.id, tmdbId));
    selection.exit();
  };
  const menuItems = [
    { label: 'Rename', onClick: () => { setRenameValue(list.name); setRenaming(true); } },
    { label: list.is_public ? COMMON.makePrivate : 'Make public', onClick: () => setListPublic(list.id, !list.is_public) },
    ...(list.is_public && share ? [{ label: 'Share link', onClick: () => share(list) }] : []),
    { label: 'Delete list', onClick: () => setConfirmDelete(true), danger: true },
  ];

  return (
    <Frame
      title={list.name}
      count={count ?? allItems.length}
      subtitle={list.is_public ? 'Public' : undefined}
      headerRight={
        <>
          {list.is_public && share && <button type="button" className="btn btn-ghost btn-sm" onClick={() => share(list)}>{shareCopied ? COMMON.copied : COMMON.share}</button>}
          <HeaderIconButton label={`Add item to ${list.name}`} onClick={() => setShowAdd(true)}>
            <PlusIcon />
          </HeaderIconButton>
          <SelectControls
            selection={selection}
            hasItems={visible.length > 0}
            menuLabel={`Open options for ${list.name}`}
            deleteLabel="Remove"
            onDelete={removeSelected}
            extraItems={menuItems}
          />
        </>
      }
    >
      {renaming && (
        <div className="mylists-rename">
          <input
            type="text"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitRename(); if (e.key === 'Escape') setRenaming(false); }}
            autoFocus
            aria-label={`Rename ${list.name}`}
          />
          <button className="btn btn-primary btn-xs" onClick={submitRename}>{COMMON.save}</button>
          <button className="btn btn-ghost btn-xs" onClick={() => setRenaming(false)}>{COMMON.cancel}</button>
        </div>
      )}

      {allItems.length === 0 ? (
        <Empty onAdd={() => setShowAdd(true)} addLabel={`Add item to ${list.name}`}>No items yet.</Empty>
      ) : narrowed && visible.length === 0 ? (
        <Empty>No items match the current filter.</Empty>
      ) : (
        <div className={pageLayout ? 'list-page-items' : ''}>
        <CardGrid>
          {visible.map(item => {
            const title = item.title || MEDIA.unknown;
            return (
              <ListCard
                key={item.id}
                title={title}
                img={posterUrl(item.poster_path, 'w185')}
                meta={item.media_type === 'tv' ? MEDIA.series : MEDIA.movie}
                {...(pageLayout ? cardState(item, historyEntries, privateNotes) : {})}
                {...(pageLayout ? cardActions(item, favorites, watchlist, fw) : {})}
                onOpen={() => openPanel(item.tmdb_id, item.media_type)}
                editMode={selection.editMode}
                selected={selection.selected.has(item.tmdb_id)}
                onToggleSelect={() => selection.toggle(item.tmdb_id)}
              />
            );
          })}
        </CardGrid>
        {pageLayout && <div className="list-page-rows">{visible.map(item => {
          const title = item.title || MEDIA.unknown;
          const open = () => selection.editMode ? selection.toggle(item.tmdb_id) : openPanel(item.tmdb_id, item.media_type);
          return <ListPageRow key={`row:${item.id}`} item={item} title={title} meta={item.media_type === 'tv' ? MEDIA.series : MEDIA.movie} open={open} selection={selection} />;
        })}</div>}
        </div>
      )}

      {showAdd && (
        <AddToFavoritesModal title="Add to List" onAdd={(item) => addItem(list.id, item)} onClose={() => setShowAdd(false)} />
      )}
      {confirmDelete && (
        <ConfirmModal
          title={`Delete "${list.name}"?`}
          message={allItems.length > 0
            ? `This list has ${allItems.length} title${allItems.length === 1 ? '' : 's'}. This can't be undone.`
            : "This can't be undone."}
          confirmLabel="Delete list"
          danger
          onConfirm={async () => { await deleteList(list.id); onDeleted?.(); }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </Frame>
  );
}

/* ── Top 5: one equal slot per rank behind a Movies / TV switch ──
   Every rank carries a numeral cut out of its poster's corner. Five slots is
   a list people finish, where ten was mostly dashed boxes. Edit mode supports
   dragging between ranks, with arrow controls as a precise fallback. */
export function TopFiveSection({ topLists, Frame = ListSection }) {
  const { openPanel } = useApp();
  const [listType,   setListType]   = useState('movies');
  const [editMode,   setEditMode]   = useState(null);
  const [addingRank, setAddingRank] = useState(null);
  const [draggedRank, setDraggedRank] = useState(null);
  const [dragOverRank, setDragOverRank] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const dragging = useRef(false);

  const items   = (topLists.lists[listType] || []).filter(i => i.rank <= TOP_LIST_SIZE);
  const maxRank = items.reduce((max, i) => Math.max(max, i.rank), 0);
  const slots   = Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1);
  const typeLabel = listType === 'movies' ? 'movie' : 'TV show';
  const reordering = editMode === 'reorder';
  const selecting = editMode === 'select';

  const toggleSelected = (tmdbId) => setSelected(current => {
    const next = new Set(current);
    if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
    return next;
  });
  const finishEditing = () => {
    setEditMode(null);
    setSelected(new Set());
  };
  const removeSelected = async () => {
    await Promise.all([...selected].map(tmdbId => topLists.removeSlot(listType, tmdbId)));
    finishEditing();
  };

  const dragTargetProps = (rank) => !reordering ? {} : {
    onDragOver: (event) => { event.preventDefault(); setDragOverRank(rank); },
    onDragLeave: () => setDragOverRank(current => current === rank ? null : current),
    onDrop: async (event) => {
      event.preventDefault();
      if (draggedRank != null && draggedRank !== rank) await topLists.moveToRank(listType, draggedRank, rank);
      setDraggedRank(null);
      setDragOverRank(null);
    },
  };

  const slot = (rank) => {
    const item = items.find(i => i.rank === rank);
    const cls  = 'top5-slot';
    if (!item) {
      return (
        <div key={rank} className={`${cls}${dragOverRank === rank ? ' drag-over' : ''}`} {...dragTargetProps(rank)}>
          <span className="rank-cut-frame">
            <button
              type="button"
              className="top5-slot--empty interactive-surface"
              onClick={() => setAddingRank(rank)}
              aria-label={`Add your #${rank} ${typeLabel}`}
            >
              <PlusIcon />
              <span className="top5-hint">{rank === 1 ? "What's your GOAT?" : 'Add a title'}</span>
            </button>
            <span className="rank-cut">{rank}</span>
          </span>
        </div>
      );
    }
    const img = posterUrl(item.poster_path, 'w185');
    return (
      <div
        key={rank}
        className={`${cls}${reordering ? ' draggable' : ''}${draggedRank === rank ? ' dragging' : ''}${dragOverRank === rank ? ' drag-over' : ''}`}
        draggable={reordering}
        onDragStart={(event) => {
          dragging.current = true;
          setDraggedRank(rank);
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', String(rank));
        }}
        onDragEnd={() => {
          setDraggedRank(null);
          setDragOverRank(null);
          window.setTimeout(() => { dragging.current = false; }, 0);
        }}
        {...dragTargetProps(rank)}
      >
        <button
          type="button"
          className="top5-hit interactive-surface"
          onClick={() => {
            if (dragging.current) return;
            if (selecting) toggleSelected(item.tmdb_id);
            else if (!reordering) openPanel(item.tmdb_id, item.media_type);
          }}
          aria-label={selecting ? `${selected.has(item.tmdb_id) ? 'Deselect' : 'Select'} ${item.title}` : reordering ? `Reorder ${item.title}` : `View details for ${item.title}`}
          aria-pressed={selecting ? selected.has(item.tmdb_id) : undefined}
        >
          <span className="rank-cut-frame">
            <span className="top5-poster">
              {img ? <img src={img} alt="" loading="lazy" /> : <span className="mylists-card-placeholder">{item.title}</span>}
            </span>
            <span className="rank-cut">{rank}</span>
          </span>
          <span className="top5-title">{item.title}</span>
        </button>
        {selecting && (
          <SelectCircle
            selected={selected.has(item.tmdb_id)}
            onClick={(event) => { event.stopPropagation(); toggleSelected(item.tmdb_id); }}
            label={`${selected.has(item.tmdb_id) ? 'Deselect' : 'Select'} ${item.title}`}
          />
        )}
        {reordering && (
          <div className="mylists-top10-controls">
            <button className="top5-reorder-btn" type="button" disabled={rank === 1} onClick={() => topLists.moveUp(listType, rank)} aria-label={`Move ${item.title} up one place`}>‹</button>
            <button className="top5-reorder-btn" type="button" disabled={rank >= maxRank} onClick={() => topLists.moveDown(listType, rank)} aria-label={`Move ${item.title} down one place`}>›</button>
          </div>
        )}
      </div>
    );
  };

  const typeSwitch = (
    <div className="discover-plat-switch" role="tablist" aria-label="Top 5 list">
      {[{ id: 'movies', label: MEDIA.movies }, { id: 'tv', label: MEDIA.tv }].map(t => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === listType}
          className={`discover-plat-switch-btn${t.id === listType ? ' active' : ''}`}
          onClick={() => { setListType(t.id); finishEditing(); }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
  const actions = items.length > 0 && (
    editMode
      ? (
        <>
          {selecting && selected.size > 0 && (
            <HeaderIconButton label={`Remove ${selected.size} selected`} onClick={removeSelected} danger>
              <TrashIcon />
            </HeaderIconButton>
          )}
          <HeaderIconButton label="Done editing" onClick={finishEditing} success>
            <TickIcon />
          </HeaderIconButton>
        </>
      )
      : <KebabMenu ariaLabel="Top 5 options" items={[
        { label: 'Reorder', onClick: () => setEditMode('reorder') },
        { label: COMMON.select, onClick: () => setEditMode('select') },
      ]} />
  );

  return (
    <Frame title="Top 5" headerRight={<>{typeSwitch}{actions}</>}>
      <div className="top5">
        {slot(1)}
        <div className="top5-rest">{slots.slice(1).map(slot)}</div>
      </div>
      {addingRank && (
        <AddToRankModal
          listType={listType}
          rank={addingRank}
          onAdd={(item) => topLists.setSlot(listType, addingRank, item)}
          onClose={() => setAddingRank(null)}
        />
      )}
    </Frame>
  );
}
