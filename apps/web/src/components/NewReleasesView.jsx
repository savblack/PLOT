import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { prepareNewReleaseGenreRails } from '@plot/core/useNewReleases.js';
import { useMemo, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useNewReleases } from '../hooks/useNewReleases.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import EmptyState from './EmptyState.jsx';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { DiscoverToolbar, RailSection, RankedCard } from './DiscoverView.jsx';
import SideFilters from './SideFilters.jsx';

/* The filtered, alphabetical set of genre rails, and nothing else. Last 30
   Days, Most Binged Shows, Now Showing and Top 10 by Platform led the page
   until 17 Nov 2026 (Savannah: the page is the genres, narrowed by the side
   panel's filter). */
function NewReleasesContent({ openPanel, watchlist, rails, loading }) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!rails.length) {
    return (
      <EmptyState className="empty-state--below" title={DISCOVER_VIEW.newReleasesEmpty.title} body={DISCOVER_VIEW.newReleasesEmpty.filtered} />
    );
  }

  return (
    <div className="discover-sections">
      {rails.map(rail => (
        <RailSection key={rail.key} id={`new-releases-${rail.key}`} title={rail.title} subtitle={rail.subtitle}>
          {rail.items.map(item => (
            <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      ))}
    </div>
  );
}

export default function NewReleasesView() {
  const app = useApp();
  const { genres } = useGenres();
  const { data, loading } = useNewReleases();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const rails = useMemo(
    () => prepareNewReleaseGenreRails(data.genreRails, typeFilters, genreFilters),
    [data.genreRails, typeFilters, genreFilters],
  );

  if (!app) return null;
  const { openPanel, watchlist } = app;

  return (
    <div className="new-releases-page">
      <DiscoverToolbar
        ariaLabel="Filter new releases"
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
        genres={genres}
      />
      <div className="cal-body new-releases-layout">
        <aside className="cal-side new-releases-side">
            <SideFilters
              typeFilters={typeFilters}
              setTypeFilters={setTypeFilters}
              genreFilters={genreFilters}
              setGenreFilters={setGenreFilters}
              genres={genres}
            />
        </aside>
        <div className="new-releases-stream">
          <NewReleasesContent openPanel={openPanel} watchlist={watchlist} rails={rails} loading={loading} />
        </div>
      </div>
    </div>
  );
}
