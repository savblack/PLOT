import { buildListShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useShare } from '../hooks/useShare.js';
import { favoriteWords } from '../utils/spelling.js';
import { EVENTS } from '../lib/analytics.js';
import { ALL_TYPES, filterByTypeAndGenre } from '@plot/core/mediaFilters.js';
import { customListIdFromKey, customListKey, sortListItems, titleCount, wantToWatchItems } from '@plot/core/listCollections.js';
import { localDateStr } from '../utils/date.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { CustomListSection, FavoritesSection, WantToWatchSection } from './ListSections.jsx';
import { IconSearch } from './navIcons.jsx';
import SideFilters from './SideFilters.jsx';
import KebabMenu from './KebabMenu.jsx';
import { useHistory } from '../hooks/useHistory.js';

const GridIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
const RowsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="5.5" height="5.5" rx="1.5" /><rect x="3" y="13.5" width="5.5" height="5.5" rx="1.5" /><path d="M12 6.5h9M12 9.5h6M12 15h9M12 18h6" /></svg>;
const SortIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3" /></svg>;

function ListPageFrame({ title, subtitle, count, filter, headerRight, query, onQuery, view, onView, onSort, children }) {
  return (
    <section className={`list-page list-page--${view}`}>
      <Link className="list-page-back list-page-back--mobile" to="/my-lists"><span aria-hidden="true">‹</span> {CUSTOM_LISTS.backToMyLists}</Link>
      <header className="list-page-head">
        <div className="list-page-heading">
          <h1 className="list-page-title">{title}</h1>
          <span className="list-page-sub">{titleCount(count)}{subtitle ? ` · ${subtitle}` : ''}</span>
        </div>
        <label className="hist-search list-page-search"><IconSearch /><input type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder={CUSTOM_LISTS.searchThisList} aria-label={CUSTOM_LISTS.searchThisList} /></label>
      </header>
      <div className={`list-page-body${filter ? '' : ' list-page-body--no-side'}`}>
        {filter && <aside className="list-page-side">{filter}</aside>}
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
              <div className="list-page-actions">{headerRight}</div>
            </div>
          </div>
          {children}
        </div>
      </div>
    </section>
  );
}

export default function ListPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { user, profile, topLists, favorites, customLists, watching, watchlist } = useApp();
  const history = useHistory(user?.id);
  const { genres } = useGenres();
  const fw = favoriteWords(profile?.region);
  const { share, copied } = useShare();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
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
  const resolvedView = view === 'auto' ? (narrow ? 'rows' : 'grid') : view;

  const shareList = useCallback((list) => share({
    url: list.is_public ? buildListShareUrl({ listId: list.id }) : null,
    title: `${list.name} · PLOT`,
    text: SHARING.listText(list.name),
    event: EVENTS.LIST_SHARED,
    eventProps: { list_id: list.id },
  }), [share]);

  const want = useMemo(() => wantToWatchItems(watchlist.items, watching.items, localDateStr()), [watchlist.items, watching.items]);

  const customId = customListIdFromKey(key);
  const list = customId ? customLists.lists.find(l => l.id === customId) : null;

  const matchQuery = useCallback((items) => {
    const term = query.trim().toLowerCase();
    return term ? items.filter(item => (item.title || item.name || '').toLowerCase().includes(term)) : items;
  }, [query]);

  const sortItems = useCallback((items) => sortListItems(items, sort), [sort]);

  const showFilter = key === 'want' || key === 'favorites';

  // One frame component per page, memoised so the list inside it keeps its
  // state (selection, open sheets) across re-renders.
  const Frame = useMemo(() => {
    return function PageFrame(props) {
      return (
        <ListPageFrame
          count={props.count}
          filter={showFilter && (
            <SideFilters
              typeFilters={typeFilters}
              setTypeFilters={setTypeFilters}
              genreFilters={genreFilters}
              setGenreFilters={setGenreFilters}
              genres={genres}
            />
          )}
          query={query}
          onQuery={setQuery}
          view={resolvedView}
          onView={setView}
          onSort={setSort}
          {...props}
        />
      );
    };
  }, [showFilter, typeFilters, genreFilters, genres, query, resolvedView]);

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  if (key === 'want') {
    const items = sortItems(matchQuery(filterByTypeAndGenre(want, typeFilters, genreFilters)));
    return <WantToWatchSection items={items} count={want.length} narrowed={false} Frame={Frame} pageLayout historyEntries={history.entries} />;
  }
  if (key === 'favorites') {
    return <FavoritesSection favorites={favorites} visibleItems={sortItems(matchQuery(filterByTypeAndGenre(favorites.favorites, typeFilters, genreFilters)))} count={favorites.favorites.length} typeFilters={typeFilters} genreFilters={genreFilters} narrowed={false} Frame={Frame} pageLayout historyEntries={history.entries} />;
  }
  if (list) {
    return (
      <CustomListSection
        key={customListKey(list.id)}
        list={list}
        visibleItems={sortItems(matchQuery(list.items || []))}
        count={(list.items || []).length}
        customLists={customLists}
        typeFilters={ALL_TYPES}
        genreFilters={[]}
        narrowed={false}
        share={shareList}
        shareCopied={copied}
        onDeleted={() => navigate('/my-lists')}
        Frame={Frame}
        pageLayout
        historyEntries={history.entries}
      />
    );
  }

  return (
    <div className="empty-state" style={{ marginTop: '1rem' }}>
      <div className="empty-title">List not found</div>
      <div className="empty-body">{fw.plural}, Want to Watch, your Top 5s and your own lists live on My Lists.</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/my-lists')}>Back to My Lists</button>
    </div>
  );
}
