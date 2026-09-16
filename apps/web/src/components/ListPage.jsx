import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../hooks/useApp.js';
import { useShare } from '../hooks/useShare.js';
import { favoriteWords } from '../utils/spelling.js';
import { EVENTS } from '../lib/analytics.js';
import { ALL_TYPES, filterByTypeAndGenre, isTypeNarrowed } from '@plot/core/mediaFilters.js';
import { customListIdFromKey, customListKey, wantToWatchItems } from '@plot/core/listCollections.js';
import { localDateStr } from '../utils/date.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import ListCover from './ListCover.jsx';
import { TypeGenreFilter } from './ListCards.jsx';
import { CustomListSection, FavoritesSection, WantToWatchSection } from './ListSections.jsx';

/* The page behind a cover on My Lists. The cover becomes the header, with
   the count and the type filter beside it; the body is the list itself,
   rendered by the same component My Lists would use, into this frame. */

function ListPageFrame({ cover, filter, title, subtitle, headerRight, children }) {
  return (
    <section className="list-page">
      <header className="list-page-head">
        {cover}
        <div className="list-page-heading">
          <h2 className="list-page-title">{title}</h2>
          {subtitle && <span className="list-page-sub">{subtitle}</span>}
          <div className="list-page-controls">
            {filter}
            <div className="list-page-actions">{headerRight}</div>
          </div>
        </div>
      </header>
      {children}
    </section>
  );
}

export default function ListPage() {
  const { key } = useParams();
  const navigate = useNavigate();
  const { user, profile, topLists, favorites, customLists, watching, watchlist } = useApp();
  const fw = favoriteWords(profile?.region);
  const { share } = useShare();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const narrowed = isTypeNarrowed(typeFilters) || genreFilters.length > 0;

  const shareList = useCallback((list) => share({
    url: `${window.location.origin}/list/${list.id}`,
    title: `${list.name} · PLOT`,
    text: `My list "${list.name}" on PLOT`,
    event: EVENTS.LIST_SHARED,
    eventProps: { list_id: list.id },
  }), [share]);

  const want = useMemo(() => wantToWatchItems(watchlist.items, watching.items, localDateStr()), [watchlist.items, watching.items]);

  const customId = customListIdFromKey(key);
  const list = customId ? customLists.lists.find(l => l.id === customId) : null;

  // What the frame's cover shows: this list's own posters, front first.
  const coverPosters = useMemo(() => {
    if (key === 'want')         return want.map(i => i.poster_path);
    if (key === 'favorites')    return favorites.favorites.map(i => i.poster_path);
    if (list)                   return [...(list.items || [])].reverse().map(i => i.poster_path);
    return [];
  }, [key, want, favorites.favorites, list]);

  const showFilter = key === 'want' || key === 'favorites' || !!list;

  // One frame component per page, memoised so the list inside it keeps its
  // state (selection, open sheets) across re-renders.
  const Frame = useMemo(() => {
    const cover = (props) => <ListCover posters={coverPosters} labelled={false} size={168} {...props} />;
    return function PageFrame(props) {
      return (
        <ListPageFrame
          cover={cover({ name: props.title })}
          filter={showFilter && <TypeGenreFilter ariaLabel={`Filter ${props.title}`} typeFilters={typeFilters} setTypeFilters={setTypeFilters} genreFilters={genreFilters} setGenreFilters={setGenreFilters} />}
          {...props}
        />
      );
    };
  }, [key, coverPosters, showFilter, typeFilters, genreFilters]);

  if (!user) return null;
  if (topLists.loading || favorites.loading || customLists.loading || watchlist.loading || watching.loading) {
    return <LoadingSpinner />;
  }

  if (key === 'want') {
    return <WantToWatchSection items={filterByTypeAndGenre(want, typeFilters, genreFilters)} narrowed={false} Frame={Frame} />;
  }
  if (key === 'favorites') {
    return <FavoritesSection favorites={favorites} typeFilters={typeFilters} genreFilters={genreFilters} narrowed={false} Frame={Frame} />;
  }
  if (list) {
    return (
      <CustomListSection
        key={customListKey(list.id)}
        list={list}
        customLists={customLists}
        typeFilters={typeFilters}
        genreFilters={genreFilters}
        narrowed={narrowed}
        share={shareList}
        onDeleted={() => navigate('/my-lists')}
        Frame={Frame}
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
