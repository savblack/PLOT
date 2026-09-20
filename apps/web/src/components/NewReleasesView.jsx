import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useNewReleases } from '../hooks/useNewReleases.js';
import { filterByType, filterByGenre } from '../utils/mediaFilters.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { DiscoverToolbar, RailSection, RankedCard } from './DiscoverView.jsx';

/* The page behind Home's "See all" on New Releases: the last 30 days, then a
   rail per genre. It was a sub-tab of Home; it is a route of its own now so
   Home can stay one scroll. */
function NewReleasesContent({ openPanel, watchlist, typeFilters, genreFilters }) {
  const { data, loading } = useNewReleases();
  if (loading) {
    return <LoadingSpinner />;
  }

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);
  const recent = applyFilters(data.recent);
  const genreRails = data.genreRails.map(rail => ({ ...rail, items: applyFilters(rail.items) }));
  const hasContent = recent.length > 0 || genreRails.some(rail => rail.items.length > 0);

  if (!hasContent) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Nothing new</div>
        <div className="empty-body">Nothing matches right now. Try widening your filters.</div>
      </div>
    );
  }

  return (
    <div className="discover-sections">
      {recent.length > 0 && (
        <RailSection title="Recently Released" subtitle="Last 30 days">
          {recent.map(item => (
            <RankedCard key={`${item.media_type}-${item.id}`} item={item} showRank={false} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </RailSection>
      )}

      {genreRails.filter(rail => rail.items.length > 0).map(rail => (
        <RailSection key={rail.key} title={rail.label}>
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
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);

  if (!app) return null;
  const { openPanel, openSearch, watchlist } = app;

  return (
    <div>
      <DiscoverToolbar
        ariaLabel="Filter new releases"
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
        genres={genres}
        onOpenSearch={openSearch}
      />
      <NewReleasesContent openPanel={openPanel} watchlist={watchlist} typeFilters={typeFilters} genreFilters={genreFilters} />
    </div>
  );
}
