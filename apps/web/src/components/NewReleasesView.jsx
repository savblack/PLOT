import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { prepareNewReleaseGenreRails } from '@plot/core/useNewReleases.js';
import { useMemo, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useNewReleases } from '../hooks/useNewReleases.js';
import { usePlatformCharts } from '../hooks/usePlatformCharts.js';
import { filterByType, filterByGenre } from '../utils/mediaFilters.js';
import { MEDIA } from '../copy/media.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import EmptyState from './EmptyState.jsx';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { DiscoverToolbar, PlatformCharts, RailSection, RankedCard } from './DiscoverView.jsx';
import SideFilters from './SideFilters.jsx';
import { NewReleasesJumpBar, NewReleasesJumpCard } from './NewReleasesJump.jsx';
import { useActiveRail } from '../hooks/useActiveRail.js';

/* What is out now, then the same filtered, alphabetical set of genre rails.
   The first four rows (Last 30 days, Most Binged, Now Showing, Top 10 by
   Platform) were Home shelves until November 2026; they live here so Home is
   five shelves that do not repeat each other. */
function NewReleasesContent({ openPanel, watchlist, rails, loading, platformList, typeFilters, genreFilters }) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!rails.length && !platformList.length) {
    return (
      <EmptyState className="empty-state--below" title={DISCOVER_VIEW.newReleasesEmpty.title} body={DISCOVER_VIEW.newReleasesEmpty.filtered} />
    );
  }

  return (
    <div className="discover-sections">
      {rails.map(rail => rail.key === 'platforms' ? (
        <PlatformCharts key="platforms" id="new-releases-platforms" platformList={platformList} openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />
      ) : (
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
  // Hard-coded official-chart platforms, the same set for everyone. The hook
  // returns only platforms with synced rows; PlatformCharts fills in the rest.
  const platformList = usePlatformCharts();
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);
  const rails = useMemo(() => {
    const applyFilters = (items) => filterByGenre(filterByType(items ?? [], typeFilters), genreFilters);
    const lead = [
      { key: 'recent', title: 'Last 30 Days', items: applyFilters(data.recent) },
      { key: 'binged', title: 'Most Binged Shows', subtitle: 'Popular TV', items: applyFilters(data.binged) },
      { key: 'cinema', title: 'Now Showing', subtitle: MEDIA.inCinemas, items: applyFilters(data.cinema) },
    ].filter(rail => rail.items.length > 0);
    const platforms = platformList.length > 0 ? [{ key: 'platforms', title: 'Top 10 by Platform', items: platformList }] : [];
    const genreRails = prepareNewReleaseGenreRails(data.genreRails, typeFilters, genreFilters).map(rail => ({ ...rail, isGenre: true }));
    return [...lead, ...platforms, ...genreRails];
  }, [data.recent, data.genreRails, data.binged, data.cinema, platformList, typeFilters, genreFilters]);

  const [currentKey, jumpTo] = useActiveRail(rails);

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
      {!loading && <NewReleasesJumpBar rails={rails} currentKey={currentKey} onJump={jumpTo} />}
      <div className="cal-body new-releases-layout">
        <aside className="cal-side new-releases-side">
          {!loading && <NewReleasesJumpCard rails={rails} currentKey={currentKey} onJump={jumpTo} />}
          <section className="hist-card home-filter-card">
            <SideFilters
              typeFilters={typeFilters}
              setTypeFilters={setTypeFilters}
              genreFilters={genreFilters}
              setGenreFilters={setGenreFilters}
              genres={genres}
            />
          </section>
        </aside>
        <div className="new-releases-stream">
          <NewReleasesContent openPanel={openPanel} watchlist={watchlist} rails={rails} loading={loading} platformList={platformList} typeFilters={typeFilters} genreFilters={genreFilters} />
        </div>
      </div>
    </div>
  );
}
