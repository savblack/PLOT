import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useHistory } from '../hooks/useHistory.js';
import { useGenres } from '../hooks/useGenres.js';
import { useUnifiedSearch } from '@plot/core/useUnifiedSearch.js';
import { describeSearchResult, placeSearchRows, pushRecentSearch, SEARCH_PLACES } from '@plot/core/search.js';
import { loadDiscoverData } from '@plot/core/useDiscover.js';
import { wantToWatchItems, TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { APP_NAV_ITEMS, MY_LISTS_TABS } from '@plot/core/navigation.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { localDateStr, shortDayMonth } from '@plot/core/date.js';
import { useCalendar } from '../hooks/useCalendar.js';
import { posterUrl, profileUrl } from '../utils/images.js';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { readStorage, writeStorage } from '../utils/storage.js';
import { track, EVENTS } from '../lib/analytics.js';
import { SEARCH_PALETTE } from '../copy/searchPalette.js';
import { MEDIA } from '../copy/media.js';
import { MEDIA_PANEL } from '../copy/mediaPanel.js';
import { COMMON } from '../copy/common.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import Spinner from './Spinner.jsx';
import Icon from './Icon.jsx';
import EmptyState from './EmptyState.jsx';
import Chip, { ChipRow, Tag } from './Chip.jsx';
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

// Each place is a page, so it carries that page's nav name.
const NAV_ID = { home: 'home', calendar: 'calendar', lists: 'my-lists', history: 'history' };
const placeLabel = (place) => (place === 'everywhere'
  ? SEARCH_PALETTE.everywhere
  : APP_NAV_ITEMS.find(item => item.id === NAV_ID[place])?.label || place);
const TOP_LABEL = MY_LISTS_TABS.find(tab => tab.id === 'top10')?.label;
const NO_ROWS = [];

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
  const art = useUserArtwork();
  const { kind, data } = item;
  let thumb, title, meta, kindLabel, round = false, inList = false, watched = false;

  if (kind === 'library') {
    thumb = posterUrl(displayPosterPath(art.apply(data)), 'w92');
    title = data.title || MEDIA.unknown;
    // A place search says where the match sits: the list, or the date.
    meta = [data.date && shortDayMonth(data.date), data.where].filter(Boolean).join(' · ');
    kindLabel = STATUS_LABEL[data.status] || SEARCH_PALETTE.kind[data.media_type] || SEARCH_PALETTE.kind.movie;
  } else if (kind === 'title') {
    const type = data.media_type || 'movie';
    const d = describeSearchResult(data, genres);
    thumb = posterUrl(displayPosterPath(art.apply(data)), 'w92');
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
    thumb = profileUrl(art.path('person', data.id, 'profile') || data.profile_path, 'w185');
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
      {watched && <Tag tone="sage" label={MEDIA.watched} />}
      {inList && (
        <Icon name="bookmark" filled className="search-palette-saved" label={MEDIA_PANEL.inWatchlist} />
      )}
      <span className={`search-palette-kind${kind === 'library' ? ' own' : ''}`}>{kindLabel}</span>
      {active && <Kbd>↵</Kbd>}
    </button>
  );
}

export default function SearchPalette({ onClose, initialQuery = '' }) {
  const { openPanel, watchlist, watching, user, profile, reminders, topLists, favorites, customLists } = useApp();
  const navigate = useNavigate();
  const history = useHistory(user?.id);
  const { genres } = useGenres();

  const [query, setQuery] = useState(initialQuery);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const [place, setPlace] = useState('everywhere');
  const local = place !== 'everywhere';

  // Calendar's events are only built once Calendar is the place picked.
  const listsReady = !watchlist?.loading && !watching?.loading && !reminders?.loading;
  const calendar = useCalendar(
    watchlist?.items,
    watching?.items,
    watching?.fetchSeason,
    reminders?.reminders,
    { ready: place === 'calendar' && listsReady },
  );

  // Home's shelves, loaded the first time Home is picked.
  const hideKids = !(profile?.include_kids_content ?? true);
  const [shelves, setShelves] = useState(null);
  useEffect(() => {
    if (place !== 'home' || shelves) return undefined;
    let cancelled = false;
    const keep = (data) => {
      if (cancelled) return;
      setShelves([[data.hero], data.hotRail, data.weekly, data.bingedShows, data.cinemaMovies, data.anticipatedMovies]
        .map(shelf => (shelf || []).filter(Boolean)));
    };
    loadDiscoverData({ hideKids, onPrimary: keep }).then(keep).catch(() => { if (!cancelled) setShelves([]); });
    return () => { cancelled = true; };
  }, [place, shelves, hideKids]);

  const placeRows = useMemo(() => {
    if (place === 'lists') {
      const top = (items, mediaType) => ({
        name: TOP_LABEL,
        mediaType,
        items: (items || []).filter(item => item.rank <= TOP_LIST_SIZE),
      });
      // The same lists, in the same order, as the My Lists page.
      return placeSearchRows('lists', { lists: [
        { name: '', status: 'watching', mediaType: 'tv', items: watching?.items },
        top(topLists?.lists?.movies, 'movie'),
        top(topLists?.lists?.tv, 'tv'),
        { name: CUSTOM_LISTS.wantToWatch, items: wantToWatchItems(watchlist?.items || [], watching?.items || [], localDateStr()) },
        ...(FAVOURITES_ENABLED ? [{ name: '', items: favorites?.favorites }] : []),
        ...(customLists?.lists || []).map(list => ({ name: list.name, items: list.items })),
      ] });
    }
    if (place === 'history') return placeSearchRows('history', { history: history?.entries });
    if (place === 'calendar') return placeSearchRows('calendar', { calendarEvents: calendar.events, todayStr: localDateStr() });
    if (place === 'home') {
      return placeSearchRows('home', { shelves: [
        (watching?.items || []).map(item => ({ ...item, id: item.tmdb_id, media_type: 'tv' })),
        ...(shelves || []),
      ] });
    }
    return NO_ROWS;
  }, [place, watching?.items, watchlist?.items, topLists?.lists, favorites?.favorites, customLists?.lists, history?.entries, calendar.events, shelves]);
  // The page's titles are still arriving, so "nothing matches" would be a lie.
  const placeLoading = (place === 'calendar' && calendar.loading) || (place === 'home' && !shelves);

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
    place,
    placeRows,
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
      openPanel(data.id, 'person', 'search');
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
    if (!searched || loading || placeLoading || items.length) return null;
    if (local) return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noneIn(placeLabel(place)) };
    if (scope === 'friends') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noFriends };
    if (scope === 'people') return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noPeople };
    if (emptyMode === 'title-guidance') return { title: MEDIA.searchByTitle, body: MEDIA.searchByTitleBody };
    return { title: SEARCH_PALETTE.noResults, body: SEARCH_PALETTE.noResultsBody };
  }, [searched, loading, placeLoading, items.length, scope, emptyMode, local, place]);

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
            placeholder={local ? SEARCH_PALETTE.placeholderIn(placeLabel(place)) : SEARCH_PALETTE.placeholder}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls="search-palette-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
          />
          {(loading || (placeLoading && term.length >= 2)) && <Spinner size="sm" label={SEARCH_PALETTE.loading} />}
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

        {user && (
          <div className="search-palette-places" role="radiogroup" aria-labelledby="search-palette-places-label">
            <span id="search-palette-places-label" className="search-palette-places-label">{SEARCH_PALETTE.searchIn}</span>
            {SEARCH_PLACES.map(id => (
              <Chip
                key={id}
                size="sm"
                role="radio"
                label={placeLabel(id)}
                selected={place === id}
                onClick={() => { setPlace(id); inputRef.current?.focus(); }}
              />
            ))}
          </div>
        )}

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

          {showHint && !local && !items.length && recent.length > 0 && (
            <div className="search-palette-recent">
              <div className="search-palette-recent-head">
                <span>{SEARCH_PALETTE.recent}</span>
                <button type="button" onClick={forgetRecent}>{SEARCH_PALETTE.clearRecent}</button>
              </div>
              <ChipRow>
                {recent.map(termText => (
                  <Chip
                    key={termText}
                    label={termText}
                    onClick={() => { setQuery(termText); inputRef.current?.focus(); }}
                  />
                ))}
              </ChipRow>
            </div>
          )}

          {showHint && local && (
            <div className="search-palette-empty">
              <div className="search-palette-empty-title">{SEARCH_PALETTE.hintTitleIn(placeLabel(place))}</div>
              <div className="search-palette-empty-body">{SEARCH_PALETTE.placeHint[place]}</div>
            </div>
          )}

          {showHint && !local && !items.length && (
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
            <EmptyState className="search-palette-empty" title={emptyCopy.title} body={emptyCopy.body} />
          )}
        </div>

        <div className="search-palette-foot">
          <span><Kbd>↑</Kbd><Kbd>↓</Kbd> {SEARCH_PALETTE.move}</span>
          <span><Kbd>↵</Kbd> {SEARCH_PALETTE.open}</span>
          {!local && <span><Kbd>{MOD_KEY}</Kbd><Kbd>↵</Kbd> {SEARCH_PALETTE.saveToList}</span>}
          <span className="search-palette-foot-spacer" />
          {!local && (
            <span>
              {SEARCH_PALETTE.filters} <Kbd>@</Kbd> {SEARCH_PALETTE.filterFriends}<span aria-hidden="true">·</span><Kbd>/</Kbd> {SEARCH_PALETTE.filterPeople}
            </span>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
