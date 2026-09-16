import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { useGenres } from '../hooks/useGenres.js';
import { useUnifiedSearch } from '@plot/core/useUnifiedSearch.js';
import { describeSearchResult, pushRecentSearch } from '@plot/core/search.js';
import { posterUrl, profileUrl } from '../utils/images.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { track, EVENTS } from '../lib/analytics.js';
import { SEARCH_PALETTE } from '../copy/searchPalette.js';
import { MEDIA } from '../copy/media.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { COMMON } from '../copy/common.js';
import Spinner from './Spinner.jsx';
import './SearchPalette.css';

/* Web-only rendering: a command palette over whatever is on screen, opened by
   Cmd/Ctrl+K or the Search nav item. The fetching and merging live in
   @plot/core/useUnifiedSearch.js so mobile can render the same results in its
   own way; mobile still has the tabbed screen, see the parity issue in the PR
   that introduced this file. */

const RECENT_KEY = 'plot_recent_searches';
const readRecent = () => {
  try { const v = JSON.parse(readStorage(RECENT_KEY, '[]')); return Array.isArray(v) ? v : []; } catch { return []; }
};

const STATUS_LABEL = {
  watching: MEDIA_PANEL.watching,
  saved: SEARCH_PALETTE.status.saved,
  watched: MEDIA.watched,
};

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '');
const MOD_KEY = isMac ? '⌘' : 'Ctrl';

function Kbd({ children }) {
  return <kbd className="search-palette-kbd">{children}</kbd>;
}

function Initial({ text }) {
  return <span aria-hidden="true">{String(text || '?').charAt(0).toUpperCase()}</span>;
}

/* One row, whatever its kind. The row is a <button> so it is a real target for
   screen readers and for a mouse; the keyboard model on top (arrows, Enter) is
   the palette's, driven by `active`. */
function Row({ item, active, index, onHover, onSelect, watchlist, history, genres }) {
  const { kind, data } = item;
  let thumb, title, meta, kindLabel, round = false, inList = false, watched = false;

  if (kind === 'library') {
    thumb = posterUrl(data.poster_path, 'w92');
    title = data.title || MEDIA.unknown;
    meta = '';
    kindLabel = STATUS_LABEL[data.status] || SEARCH_PALETTE.kind[data.media_type] || SEARCH_PALETTE.kind.movie;
  } else if (kind === 'title') {
    const type = data.media_type || 'movie';
    const d = describeSearchResult(data, genres);
    thumb = posterUrl(data.poster_path, 'w92');
    title = data.title || data.name || MEDIA.unknown;
    meta = [d.year, ...d.genres].filter(Boolean).join(' · ');
    if (d.rating) meta = `${meta}${meta ? ' · ' : ''}${d.rating} ★`;
    kindLabel = SEARCH_PALETTE.kind[type] || SEARCH_PALETTE.kind.movie;
    inList = watchlist.isInList(data.id);
    watched = history.isWatched(data.id, type);
  } else if (kind === 'collection') {
    thumb = posterUrl(data.poster_path, 'w92');
    title = data.name;
    meta = '';
    kindLabel = SEARCH_PALETTE.kind.collection;
  } else if (kind === 'person') {
    thumb = profileUrl(data.profile_path, 'w185');
    title = data.name;
    const knownFor = (data.known_for || []).map(k => k.title || k.name).filter(Boolean).slice(0, 2).join(', ');
    meta = [data.known_for_department, knownFor].filter(Boolean).join(' · ');
    kindLabel = SEARCH_PALETTE.kind.person;
    round = true;
  } else {
    thumb = data.avatar_url || null;
    title = data.display_name || data.username;
    meta = `@${data.username}`;
    kindLabel = SEARCH_PALETTE.kind.friend;
    round = true;
  }

  return (
    <button
      type="button"
      role="option"
      id={`search-palette-option-${index}`}
      aria-selected={active}
      className={`search-palette-row${active ? ' active' : ''}`}
      onMouseMove={() => onHover(index)}
      onClick={() => onSelect(item)}
    >
      <span className={`search-palette-thumb${round ? ' round' : ''}`}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <Initial text={title} />}
      </span>
      <span className="search-palette-info">
        <span className="search-palette-title">{title}</span>
        {meta && <span className="search-palette-meta">{meta}</span>}
      </span>
      {watched && <span className="chip chip-episode">{MEDIA.watched}</span>}
      {inList && (
        <svg className="search-palette-saved" viewBox="0 0 24 24" aria-label={MEDIA.saveToWatchlist}>
          <path d="M6 4.5A2.5 2.5 0 0 1 8.5 2h7A2.5 2.5 0 0 1 18 4.5v16l-6-3.75L6 20.5v-16Z" />
        </svg>
      )}
      <span className={`search-palette-kind${kind === 'library' ? ' own' : ''}`}>{kindLabel}</span>
      {active && <Kbd>↵</Kbd>}
    </button>
  );
}

export default function SearchPalette({ onClose }) {
  const { openPanel, watchlist, watching, user } = useApp();
  const navigate = useNavigate();
  const history = useHistory(user?.id);
  const { genres } = useGenres();

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);

  // The viewer's own titles, tagged with where they sit. Priority order:
  // something you are mid-way through beats something you only saved.
  const library = useMemo(() => [
    ...(watching?.items || []).map(r => ({ ...r, media_type: r.media_type || 'tv', status: 'watching' })),
    ...(watchlist?.items || []).map(r => ({ ...r, status: 'saved' })),
    ...(history?.entries || []).map(r => ({ ...r, status: 'watched' })),
  ], [watching?.items, watchlist?.items, history?.entries]);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  // Only a key press scrolls the active row into view. A hover sets `active`
  // too, and scrolling to follow the mouse would fight the wheel.
  const scrollActiveRef = useRef(false);

  const onSearched = useCallback(({ scope, term, resultCount }) => {
    // Never the raw query (PII): length only.
    track(EVENTS.SEARCH_PERFORMED, { mode: scope, query_length: term.length, result_count: resultCount });
  }, []);

  const { items, loading, searched, emptyMode, scope, term } = useUnifiedSearch(query, {
    signedIn: !!user,
    library,
    onSearched,
  });

  const remember = useCallback((value) => {
    const next = pushRecentSearch(readRecent(), value);
    writeStorage(RECENT_KEY, JSON.stringify(next));
    setRecent(next);
  }, []);
  const forgetRecent = () => { writeStorage(RECENT_KEY, '[]'); setRecent([]); };

  // A new result set starts from the top.
  const [seenItems, setSeenItems] = useState(items);
  if (items !== seenItems) {
    setSeenItems(items);
    setActive(0);
  }

  // The active row follows the arrow keys.
  useEffect(() => {
    if (!scrollActiveRef.current) return;
    scrollActiveRef.current = false;
    const el = listRef.current?.children?.[active];
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  // Lock the page behind the palette, like the media panel does.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const select = useCallback((item, { save = false } = {}) => {
    if (!item) return;
    const { kind, data } = item;
    if (kind === 'title') {
      const type = data.media_type || 'movie';
      if (save) { watchlist.toggle({ ...data, id: data.id, media_type: type }); return; }
      openPanel(data.id, type, 'search');
    } else if (kind === 'library') {
      openPanel(data.tmdb_id, data.media_type || 'movie', 'search');
    } else if (kind === 'collection') {
      openPanel(data.id, 'collection', 'search');
    } else if (kind === 'person') {
      navigate(`/person/${data.id}`);
    } else if (kind === 'friend') {
      navigate(`/u/${data.username}`);
    }
    // Picking something is what makes a search worth remembering; a query
    // that was abandoned or came back empty is not.
    remember(query);
    onClose();
  }, [openPanel, watchlist, navigate, onClose, remember, query]);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); scrollActiveRef.current = true;
      setActive(i => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); scrollActiveRef.current = true;
      setActive(i => Math.max(i - 1, 0));
    } else if (e.key === 'Home' && e.target !== inputRef.current) {
      e.preventDefault(); scrollActiveRef.current = true; setActive(0);
    } else if (e.key === 'End' && e.target !== inputRef.current) {
      e.preventDefault(); scrollActiveRef.current = true; setActive(items.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      select(items[active], { save: e.metaKey || e.ctrlKey });
    }
  };

  const hover = useCallback((index) => {
    setActive(prev => (prev === index ? prev : index));
  }, []);

  const emptyCopy = useMemo(() => {
    if (!searched || loading || items.length) return null;
    if (scope === 'friends') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noFriends };
    if (scope === 'people') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noPeople };
    if (emptyMode === 'title-guidance') return { title: MEDIA.searchByTitle, body: MEDIA.searchByTitleBody };
    return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noResultsBody };
  }, [searched, loading, items.length, scope, emptyMode]);

  const showHint = term.length < 2;
  const activeId = items.length ? `search-palette-option-${active}` : undefined;

  return createPortal(
    <div className="search-palette-backdrop" onMouseDown={onClose}>
      <div
        className="search-palette"
        role="dialog"
        aria-modal="true"
        aria-label={SEARCH_PALETTE.label}
        onMouseDown={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="search-palette-head">
          <svg className="search-palette-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" />
          </svg>
          <input
            ref={inputRef}
            className="search-palette-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={SEARCH_PALETTE.placeholder}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="search-palette-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
          />
          {loading && <Spinner size="sm" label={SEARCH_PALETTE.loading} />}
          {query ? (
            <button
              type="button"
              className="search-palette-clear"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label={COMMON.clearSearch}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          ) : (
            <button type="button" className="search-palette-esc" onClick={onClose} aria-label={SEARCH_PALETTE.close}>
              <Kbd>esc</Kbd>
            </button>
          )}
        </div>

        <div className="search-palette-body">
          {items.length > 0 && (
            <div id="search-palette-list" role="listbox" className="search-palette-list" ref={listRef}>
              {items.map((item, index) => (
                <Row
                  key={item.key}
                  item={item}
                  index={index}
                  active={index === active}
                  onHover={hover}
                  onSelect={select}
                  watchlist={watchlist}
                  history={history}
                  genres={genres}
                />
              ))}
            </div>
          )}

          {showHint && !items.length && recent.length > 0 && (
            <div className="search-palette-recent">
              <div className="search-palette-recent-head">
                <span>{SEARCH_PALETTE.recent}</span>
                <button type="button" onClick={forgetRecent}>{SEARCH_PALETTE.clearRecent}</button>
              </div>
              <div className="search-palette-recent-chips">
                {recent.map(termText => (
                  <button
                    key={termText}
                    type="button"
                    className="search-palette-chip"
                    onClick={() => { setQuery(termText); inputRef.current?.focus(); }}
                  >
                    {termText}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showHint && !items.length && (
            <div className={`search-palette-empty${recent.length ? ' compact' : ''}`}>
              {!recent.length && <div className="search-palette-empty-title">{SEARCH_PALETTE.hintTitle}</div>}
              <div className="search-palette-empty-body">{SEARCH_PALETTE.hintBody}</div>
              <div className="search-palette-empty-tips">
                <span><Kbd>@</Kbd> {SEARCH_PALETTE.hintFriends}</span>
                <span><Kbd>/</Kbd> {SEARCH_PALETTE.hintPeople}</span>
              </div>
            </div>
          )}

          {emptyCopy && (
            <div className="search-palette-empty">
              <div className="search-palette-empty-title">{emptyCopy.title}</div>
              <div className="search-palette-empty-body">{emptyCopy.body}</div>
            </div>
          )}
        </div>

        <div className="search-palette-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> {SEARCH_PALETTE.move}</span>
          <span><Kbd>↵</Kbd> {SEARCH_PALETTE.open}</span>
          <span><Kbd>{MOD_KEY}</Kbd><Kbd>↵</Kbd> {SEARCH_PALETTE.saveToList}</span>
          <span className="search-palette-foot-spacer" />
          <span>
            {SEARCH_PALETTE.filters} <Kbd>@</Kbd> {SEARCH_PALETTE.filterFriends}<span aria-hidden="true">·</span><Kbd>/</Kbd> {SEARCH_PALETTE.filterPeople}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
