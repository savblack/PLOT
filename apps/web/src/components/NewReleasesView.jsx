import { ALL_TYPES } from '@plot/core/mediaFilters.js';
import { prepareNewReleaseGenreRails } from '@plot/core/useNewReleases.js';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { useGenres } from '../hooks/useGenres.js';
import { useNewReleases } from '../hooks/useNewReleases.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import { DiscoverToolbar, RailSection, RankedCard } from './DiscoverView.jsx';
import SideFilters from './SideFilters.jsx';

function NewReleasesJump({ rails }) {
  const [activeKey, setActiveKey] = useState(rails[0]?.key);
  const currentKey = rails.some(rail => rail.key === activeKey) ? activeKey : rails[0]?.key;

  useEffect(() => {
    const nodes = rails.map(rail => document.getElementById(`new-releases-${rail.key}`)).filter(Boolean);
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveKey(visible[0].target.id.replace('new-releases-', ''));
    }, { rootMargin: '-15% 0px -65% 0px' });
    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [rails]);

  if (!rails.length) return null;
  const jumpTo = (key) => {
    setActiveKey(key);
    document.getElementById(`new-releases-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav className="hist-card new-releases-jump" aria-label="Jump to genre">
      <div className="hist-card-head"><h2 className="hist-card-title">Jump to</h2></div>
      <div>
        {rails.map(rail => (
          <button
            key={rail.key}
            type="button"
            className="cal-filter-row"
            aria-current={currentKey === rail.key ? 'true' : undefined}
            onClick={() => jumpTo(rail.key)}
          >
            <span className="cal-filter-name">{rail.title}</span>
            <span className="mylists-jump-count">{rail.items.length}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}

/* The dedicated page is genre-led: the broad "Recently Released" rail stays
   on Home, while this stream and its index are the same filtered, alphabetical
   set of genre rails. */
function NewReleasesContent({ openPanel, watchlist, rails, loading }) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (!rails.length) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Nothing new</div>
        <div className="empty-body">Nothing matches right now. Try widening your filters.</div>
      </div>
    );
  }

  return (
    <div className="discover-sections">
      {rails.map(rail => (
        <RailSection key={rail.key} id={`new-releases-${rail.key}`} title={rail.title}>
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
  const { openPanel, openSearch, watchlist } = app;

  return (
    <div className="new-releases-page">
      <DiscoverToolbar
        ariaLabel="Filter new releases"
        typeFilters={typeFilters}
        setTypeFilters={setTypeFilters}
        genreFilters={genreFilters}
        setGenreFilters={setGenreFilters}
        genres={genres}
        onOpenSearch={openSearch}
      />
      <div className="cal-body new-releases-layout">
        <aside className="cal-side new-releases-side">
          <section className="hist-card home-filter-card">
            <SideFilters
              typeFilters={typeFilters}
              setTypeFilters={setTypeFilters}
              genreFilters={genreFilters}
              setGenreFilters={setGenreFilters}
              genres={genres}
            />
          </section>
          {!loading && <NewReleasesJump rails={rails} />}
        </aside>
        <div className="new-releases-stream">
          <NewReleasesContent openPanel={openPanel} watchlist={watchlist} rails={rails} loading={loading} />
        </div>
      </div>
    </div>
  );
}
