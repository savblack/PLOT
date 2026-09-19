import { buildListShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useShare } from '../hooks/useShare.js';
import { favoriteWords } from '../utils/spelling.js';
import { EVENTS } from '../lib/analytics.js';
import { ALL_TYPES, filterByTypeAndGenre } from '@plot/core/mediaFilters.js';
import { customListIdFromKey, customListKey, titleCount, wantToWatchItems } from '@plot/core/listCollections.js';
import { localDateStr } from '../utils/date.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { TypeGenreFilter } from './ListCards.jsx';
import { CustomListSection, FavoritesSection, WantToWatchSection } from './ListSections.jsx';
import { IconSearch } from './navIcons.jsx';

const GridIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></svg>;
const RowsIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="5.5" height="5.5" rx="1.5" /><rect x="3" y="13.5" width="5.5" height="5.5" rx="1.5" /><path d="M12 6.5h9M12 9.5h6M12 15h9M12 18h6" /></svg>;

function ListPageFrame({ title, subtitle, count, filter, headerRight, collections, activeKey, onOpen, query, onQuery, view, onView, children }) {
  return (
    <section className={`list-page list-page--${view}`}>
      <Link className="list-page-back" to="/my-lists"><span aria-hidden="true">‹</span> My Lists</Link>
      <header className="list-page-head">
        <div className="list-page-heading">
          <h1 className="list-page-title">{title}</h1>
          <span className="list-page-sub">{titleCount(count)}{subtitle ? ` · ${subtitle}` : ''}</span>
        </div>
        <label className="hist-search list-page-search"><IconSearch /><input type="search" value={query} onChange={event => onQuery(event.target.value)} placeholder={CUSTOM_LISTS.searchThisList} aria-label={CUSTOM_LISTS.searchThisList} /></label>
      </header>
      <div className="list-page-body">
        <aside className="list-page-side">
          <nav className="hist-card list-page-index" aria-label={CUSTOM_LISTS.yourLists}>
            {collections.map(collection => (
              <button key={collection.key} type="button" className="cal-filter-row" aria-current={collection.key === activeKey ? 'page' : undefined} onClick={() => onOpen(collection.key)}>
                <span className="cal-filter-name">{collection.name}</span><span className="mylists-jump-count">{collection.count}</span>
              </button>
            ))}
          </nav>
          {filter}
        </aside>
        <div className="list-page-stream">
          <div className="list-page-toolbar">
            <span className="list-page-sort">{CUSTOM_LISTS.listOrder}</span>
            <div className="list-page-toolbar-actions">
              <button type="button" className="list-page-view" aria-label={CUSTOM_LISTS.gridView} aria-pressed={view === 'grid'} onClick={() => onView('grid')}><GridIcon /></button>
              <button type="button" className="list-page-view" aria-label={CUSTOM_LISTS.listView} aria-pressed={view === 'rows'} onClick={() => onView('rows')}><RowsIcon /></button>
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
  const fw = favoriteWords(profile?.region);
  const { share, copied } = useShare();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState('auto');
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

  const collections = useMemo(() => [
    { key: 'want', name: 'Want to Watch', count: want.length },
    { key: 'favorites', name: fw.plural, count: favorites.favorites.length },
    ...customLists.lists.map(item => ({ key: customListKey(item.id), name: item.name, count: item.items?.length || 0 })),
  ], [want.length, fw.plural, favorites.favorites.length, customLists.lists]);

  const matchQuery = useCallback((items) => {
    const term = query.trim().toLowerCase();
    return term ? items.filter(item => (item.title || item.name || '').toLowerCase().includes(term)) : items;
  }, [query]);

  const showFilter = key === 'want' || key === 'favorites';

  // One frame component per page, memoised so the list inside it keeps its
  // state (selection, open sheets) across re-renders.
  const Frame = useMemo(() => {
    return function PageFrame(props) {
      return (
        <ListPageFrame
          count={props.count}
          filter={showFilter && <TypeGenreFilter ariaLabel={`Filter ${props.title}`} typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} />}
          collections={collections}
          activeKey={key}
          onOpen={(nextKey) => navigate(`/my-lists/${nextKey}`)}
          query={query}
          onQuery={setQuery}
          view={resolvedView}
          onView={setView}
          {...props}
        />
      );
    };
  }, [key, showFilter, typeFilters, genreFilters, collections, navigate, query, resolvedView]);

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  if (key === 'want') {
    const items = matchQuery(filterByTypeAndGenre(want, typeFilters, genreFilters));
    return <WantToWatchSection items={items} count={want.length} narrowed={false} Frame={Frame} pageLayout />;
  }
  if (key === 'favorites') {
    return <FavoritesSection favorites={favorites} visibleItems={matchQuery(filterByTypeAndGenre(favorites.favorites, typeFilters, genreFilters))} count={favorites.favorites.length} typeFilters={typeFilters} genreFilters={genreFilters} narrowed={false} Frame={Frame} pageLayout />;
  }
  if (list) {
    return (
      <CustomListSection
        key={customListKey(list.id)}
        list={list}
        visibleItems={matchQuery(list.items || [])}
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
      />
    );
  }

  return (
    <div className="empty-state" style={{ marginTop: '1rem' }}>
      <div className="empty-title">List not found</div>
      <div className="empty-body">{fw.plural}, Want to Watch, your Top 10s and your own lists live on My Lists.</div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigate('/my-lists')}>Back to My Lists</button>
    </div>
  );
}
