import { buildListShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { isListShareable, listVisibility } from '@plot/core/customLists.js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useShare } from '../hooks/useShare.js';
import { favoriteWords } from '../utils/spelling.js';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { EVENTS } from '../lib/analytics.js';
import { filterByTypeAndGenre } from '@plot/core/mediaFilters.js';
import { filterByWatchStatus, LIST_STATUS_FILTER_IDS } from '@plot/core/listWatchStatus.js';
import { customListIdFromKey, customListKey, sortListItems, titleCount, wantToWatchItems } from '@plot/core/listCollections.js';
import { localDateStr } from '../utils/date.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { CustomListSection, FavoritesSection, WantToWatchSection } from './ListSections.jsx';
import { SmartListSection } from './SmartListSection.jsx';
import { IconChevronLeft, IconSearch } from './navIcons.jsx';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { isSharedList } from '@plot/core/sharedLists.js';
import { SHOW_WATCH_TOGETHER } from '../launchFeatures.js';
import SideFilters, { FilterRow } from './SideFilters.jsx';
import MobilePageControls from './MobilePageControls.jsx';
import { TYPE_ROWS } from './sideFilterRows.js';
import { MEDIA } from '../copy/media.js';

// The Calendar's Show rows minus Cinema, as on History: every list here holds
// saved rows, and a saved row never carries the `_cinema` flag that row
// matches on, so on its own it could only ever show nothing.
const LIST_TYPE_ROWS = TYPE_ROWS.filter(r => r.id !== 'cinema');
const ALL_LIST_TYPES = LIST_TYPE_ROWS.map(r => r.id);
const STATUS_OPTIONS = LIST_STATUS_FILTER_IDS.map(id => ({ id, label: MEDIA.watchStatus[id] }));
import KebabMenu from './KebabMenu.jsx';
import { useHistory } from '../hooks/useHistory.js';

const GridIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
const RowsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="5.5" height="5.5" rx="1.5" /><rect x="3" y="13.5" width="5.5" height="5.5" rx="1.5" /><path d="M12 6.5h9M12 9.5h6M12 15h9M12 18h6" /></svg>;
const PlusIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
const SortIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3" /></svg>;

const CloseIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>;

/* A shared list (PLO-525) hands the frame four more things: `sidePanel`, the
   people panel above the filters; `headerActions`, Watch together and Add a
   title at the top right; `lead`, the phone and tablet people line (A8); and
   `shared`, which on a phone turns the header into a bar with a search
   button in place of the always-open field. */
function ListPageFrame({ title, subtitle, count, progress, filter, headerRight, query, onQuery, view, onView, onSort, sidePanel, headerActions, lead, onAdd, shared = false, children }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  const side = sidePanel || filter;
  const searching = searchOpen || query !== '';
  return (
    <section className={`list-page list-page--${view}${shared ? ' list-page--shared' : ''}${shared && searching ? ' list-page--search-open' : ''}`}>
      <Link className="list-page-back list-page-back--mobile" to="/my-lists"><span aria-hidden="true">‹</span> {CUSTOM_LISTS.backToMyLists}</Link>
      <header className="list-page-head">
        {shared && <Link className="list-page-bar-back" to="/my-lists" aria-label={CUSTOM_LISTS.backToMyLists}><IconChevronLeft /></Link>}
        <div className="list-page-heading">
          <h1 className="list-page-title">{title}</h1>
          <span className="list-page-sub">{titleCount(count)}{subtitle ? ` · ${subtitle}` : ''}</span>
          {progress?.total > 0 && (
            <div className="list-page-progress">
              <div className="list-page-progress-bar" role="progressbar" aria-label={MEDIA.listProgress(progress.watched, progress.total)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent}>
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <span className="list-page-progress-label">{MEDIA.listProgress(progress.watched, progress.total)}</span>
            </div>
          )}
        </div>
        <div className="list-page-head-actions">
          {shared && (
            <button
              type="button"
              className="list-page-view list-page-search-toggle"
              aria-label={searching ? COLLABORATIVE_LISTS.page.searchClose : COLLABORATIVE_LISTS.page.searchOpen}
              aria-expanded={searching}
              onClick={() => { if (searching) { setSearchOpen(false); onQuery(''); } else setSearchOpen(true); }}
            >
              {searching ? <CloseIcon /> : <IconSearch />}
            </button>
          )}
          {/* Controls sit left of the search, as on Calendar and History. */}
          {headerActions && <div className="list-page-head-buttons">{headerActions}</div>}
          <label className="hist-search list-page-search"><IconSearch /><input type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder={CUSTOM_LISTS.searchThisList} aria-label={CUSTOM_LISTS.searchThisList} ref={searchRef} /></label>
        </div>
      </header>
      {lead && <div className="list-page-lead">{lead}</div>}
      <div className={`list-page-body${side ? '' : ' list-page-body--no-side'}`}>
        {side && <aside className="list-page-side">{sidePanel}{filter}</aside>}
        <div className="list-page-stream">
          <div className="list-page-toolbar">
            <div className="list-page-toolbar-actions">
              <button type="button" className="list-page-view" aria-label={CUSTOM_LISTS.gridView} aria-pressed={view === 'grid'} onClick={() => onView('grid')}><GridIcon /></button>
              <button type="button" className="list-page-view" aria-label={CUSTOM_LISTS.listView} aria-pressed={view === 'rows'} onClick={() => onView('rows')}><RowsIcon /></button>
              <KebabMenu
                ariaLabel={CUSTOM_LISTS.sortList}
                buttonClassName="list-page-view"
                trigger={<SortIcon />}
                items={[
                  { label: CUSTOM_LISTS.listOrder, onClick: () => onSort('list') },
                  { label: CUSTOM_LISTS.titleAscending, onClick: () => onSort('title-asc') },
                  { label: CUSTOM_LISTS.titleDescending, onClick: () => onSort('title-desc') },
                ]}
              />
              {/* Below the sidebar width a shared list's Add is one more round
                  control here, not a pink button (A8). */}
              {onAdd && <button type="button" className="list-page-view list-page-add" aria-label={COLLABORATIVE_LISTS.page.addTitle} onClick={onAdd}><PlusIcon /></button>}
              <div className="list-page-actions">{headerRight}</div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

/* The frame the list sections render into.

   `Frame` is declared once, here at module scope, so its identity never
   changes. It used to be built inside the page by a `useMemo` whose deps
   included `query` — which meant every keystroke produced a new function, and
   a new function is a new component *type*: React unmounts the old subtree and
   mounts a fresh one rather than re-rendering it. The search input lives inside
   that subtree, so it was destroyed and rebuilt on each character and focus
   dropped to the body. You could type one letter at a time, clicking back into
   the field between each.

   The page's own state reaches the frame through context instead. Context
   re-renders consumers; it never remounts them. */
const ListPageContext = createContext(null);

function Frame(props) {
  const page = useContext(ListPageContext);
  // The section's own props (title, subtitle, count, headerRight, children)
  // are spread last so they win over the page-level defaults.
  return <ListPageFrame {...page} {...props} />;
}

/** @param {{ smartList?: { clients?: any, catalog?: any } | null }} props  smartList: Storybook's TMDB, seen rows and genres without a network */
export default function ListPage({ smartList: smartSeams = null } = {}) {
  const { key } = useParams();
  const navigate = useNavigate();
  const { user, profile, topLists, favorites, customLists, watching, watchlist } = useApp();
  const history = useHistory(user?.id);
  const { genres } = useGenres();
  const fw = favoriteWords(profile?.region);
  const { share, copied } = useShare();
  const [typeFilters,  setTypeFilters]  = useState(ALL_LIST_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const [statusFilters, setStatusFilters] = useState([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('auto');
  const [sort, setSort] = useState('list');
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const update = () => setNarrow(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const shareList = useCallback((list) => share({
    url: isListShareable(listVisibility(list), profile?.is_public) ? buildListShareUrl({ listId: list.id }) : null,
    title: `${list.name} · Plot`,
    text: SHARING.listText(list.name),
    event: EVENTS.LIST_SHARED,
    eventProps: { list_id: list.id },
  }), [share, profile?.is_public]);

  const want = useMemo(() => wantToWatchItems(watchlist.items, watching.items, localDateStr()), [watchlist.items, watching.items]);

  const customId = customListIdFromKey(key);
  const list = customId ? customLists.lists.find(l => l.id === customId) : null;
  const smartList = customId && !list ? customLists.smartLists?.find(l => l.id === customId) : null;
  // A shared list opens as a poster grid at every width (canvas A8); other
  // lists open as rows on a narrow screen.
  const sharedGrid = SHOW_WATCH_TOGETHER && isSharedList(list, user?.id);
  const resolvedView = view === 'auto' ? (narrow && !sharedGrid ? 'rows' : 'grid') : view;

  const matchQuery = useCallback((items) => {
    const term = query.trim().toLowerCase();
    return term ? items.filter(item => (item.title || item.name || '').toLowerCase().includes(term)) : items;
  }, [query]);

  const sortItems = useCallback((items) => sortListItems(items, sort), [sort]);

  // Not smart lists: their saved rules already pick a type and genres, and
  // they load a page at a time, so a second filter here would contradict the
  // rules and only narrow what has been fetched so far. Search still applies.
  // The Status filter and the progress bar are for the viewer's own lists:
  // Want to Watch is unwatched by definition and a smart list loads a page at a time.
  const showStatus = !!list;
  const showFilter = key === 'want' || key === 'favorites' || !!list;
  // Only CustomListSection reads this on the page: it swaps an emptied grid for
  // "No items match". Want to Watch and Favourites return null when narrowed,
  // which here would take the header and filters with it.
  const narrowed = typeFilters.length < ALL_LIST_TYPES.length || genreFilters.length > 0 || statusFilters.length > 0 || query.trim() !== '';

  // What the frame needs from the page. A fresh object per render is fine —
  // it re-renders the frame, which is the point; only a changing component
  // identity would remount it.
  const framePage = useMemo(() => ({
    // The column is display:none below 1024px and the bottom bar is hidden
    // above it, so each width gets one copy. The bar portals to the body, so
    // sitting inside the hidden column does not hide it.
    filter: showFilter ? (
      <>
        <SideFilters
          typeRows={LIST_TYPE_ROWS}
          typeFilters={typeFilters}
          setTypeFilters={setTypeFilters}
          genreFilters={genreFilters}
          setGenreFilters={setGenreFilters}
          genres={genres}
        >
          {showStatus && (
            <div className="cal-filter">
              <div className="cal-filter-label">{MEDIA.statusHeading}</div>
              <div>
                {STATUS_OPTIONS.map(({ id, label }) => (
                  <FilterRow key={id} label={label} on={statusFilters.includes(id)} onToggle={() => setStatusFilters(statusFilters.includes(id) ? statusFilters.filter(v => v !== id) : [...statusFilters, id])} />
                ))}
              </div>
            </div>
          )}
        </SideFilters>
        <MobilePageControls
          groups={[
            { heading: MEDIA.typeHeading, allLabel: MEDIA.allTypes, options: LIST_TYPE_ROWS, value: typeFilters, defaultValue: ALL_LIST_TYPES, onChange: setTypeFilters },
            { heading: MEDIA.genreHeading, allLabel: MEDIA.allGenres, columns: 2, options: genres.map(g => ({ id: g.id, label: g.name })), value: genreFilters, defaultValue: [], onChange: setGenreFilters },
            ...(showStatus ? [{ heading: MEDIA.statusHeading, allLabel: MEDIA.allStatuses, options: STATUS_OPTIONS, value: statusFilters, defaultValue: [], onChange: setStatusFilters }] : []),
          ]}
        />
      </>
    ) : null,
    query,
    onQuery: setQuery,
    view: resolvedView,
    onView: setView,
    onSort: setSort,
  }), [showFilter, showStatus, typeFilters, genreFilters, statusFilters, genres, query, resolvedView]);

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  let body;
  if (key === 'want') {
    const items = sortItems(matchQuery(filterByTypeAndGenre(want, typeFilters, genreFilters)));
    body = <WantToWatchSection items={items} count={want.length} narrowed={false} Frame={Frame} pageLayout historyEntries={history.entries} />;
  } else if (FAVOURITES_ENABLED && key === 'favorites') {
    body = <FavoritesSection favorites={favorites} visibleItems={sortItems(matchQuery(filterByTypeAndGenre(favorites.favorites, typeFilters, genreFilters)))} count={favorites.favorites.length} typeFilters={typeFilters} genreFilters={genreFilters} narrowed={false} Frame={Frame} pageLayout historyEntries={history.entries} />;
  } else if (smartList) {
    body = (
      <SmartListSection
        key={customListKey(smartList.id)}
        list={smartList}
        customLists={customLists}
        historyEntries={history.entries}
        historyReady={!history.loading}
        refine={items => sortItems(matchQuery(items))}
        onDeleted={() => navigate('/my-lists')}
        Frame={Frame}
        pageLayout
        clients={smartSeams?.clients ?? null}
        catalog={smartSeams?.catalog ?? null}
      />
    );
  } else if (list) {
    body = (
      <CustomListSection
        key={customListKey(list.id)}
        list={list}
        visibleItems={sortItems(matchQuery(filterByWatchStatus(filterByTypeAndGenre(list.items, typeFilters, genreFilters), statusFilters, history.entries, watching.items)))}
        count={(list.items || []).length}
        customLists={customLists}
        typeFilters={typeFilters}
        genreFilters={genreFilters}
        narrowed={narrowed}
        share={shareList}
        shareCopied={copied}
        onDeleted={() => navigate('/my-lists')}
        Frame={Frame}
        pageLayout
        historyEntries={history.entries}
      />
    );
  } else {
    body = (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">List not found</div>
        <div className="empty-body">{FAVOURITES_ENABLED ? `${fw.plural}, ` : ''}Want to Watch, your Top 5s and your own lists live on My Lists.</div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/my-lists')}>Back to My Lists</button>
      </div>
    );
  }

  return <ListPageContext.Provider value={framePage}>{body}</ListPageContext.Provider>;
}
