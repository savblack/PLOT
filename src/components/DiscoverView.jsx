import { useState } from 'react';
import { useApp, posterUrl, backdropUrl, TodayLabel } from '../App.jsx';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { useGenres } from '../hooks/useGenres.js';
import { useDiscover } from '../hooks/useDiscover.js';
import { UpcomingContent } from './GuideView.jsx';
import EpgView from './EpgView.jsx';
import MultiSelect from './MultiSelect.jsx';
import DiscoverSkeleton from './skeletons/DiscoverSkeleton.jsx';

const ALL_TYPES = ['tv', 'cinema', 'movie'];

/* ── Rail ── */
function Rail({ children }) {
  const { ref, handlers } = useDragScroll();
  return (
    <div className="rail-scroll" ref={ref} {...handlers}
      style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '0.75rem', paddingBottom: '1rem' }}>
      {children}
    </div>
  );
}

/* ── Save button ── */
function SaveBtn({ item, watchlist }) {
  const id    = item.id || item.tmdb_id;
  const saved = watchlist.isInList(id);
  return (
    <button
      className={`card-save-btn${saved ? ' saved' : ''}`}
      onClick={e => { e.stopPropagation(); watchlist.toggle({ ...item, id }); }}
      aria-label={saved ? 'Remove from list' : 'Add to list'}
      disabled={watchlist.loading}
    >
      <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
  );
}

/* ── Type chip ── */
function TypeChip({ item }) {
  if (item.media_type === 'tv') return <span className="chip chip-episode">TV</span>;
  if (item._cinema)             return <span className="chip chip-cinema">Cinema</span>;
  return                               <span className="chip chip-streaming">Movie</span>;
}

/* ── Poster card with optional rank badge ── */
function RankedCard({ item, rank, showRank = true, openPanel, watchlist }) {
  const title = item.title || item.name;
  const img   = posterUrl(item.poster_path, 'w185');
  const type  = item.media_type || 'movie';
  return (
    <div className="media-card" onClick={() => openPanel(item.id, type)}>
      <div className="media-card-img">
        {img
          ? <img src={img} alt={title} loading="lazy" />
          : <div className="media-card-img-placeholder" />
        }
        <div className="card-chip-overlay"><TypeChip item={item} /></div>
        <SaveBtn item={item} watchlist={watchlist} />
        {showRank && <span className="discover-rank-badge">{rank}</span>}
      </div>
      <div className="media-card-title">{title}</div>
    </div>
  );
}

/* ── Hero card (#1 trending) ── */
function HeroCard({ item, openPanel, watchlist }) {
  const title    = item.title || item.name;
  const backdrop = backdropUrl(item.backdrop_path, 'w780');
  const type     = item.media_type || 'movie';
  const year     = (item.release_date || item.first_air_date || '').slice(0, 4);
  const saved    = watchlist.isInList(item.id);

  return (
    <div className="discover-hero" onClick={() => openPanel(item.id, type)}>
      {backdrop
        ? <img className="discover-hero-backdrop" src={backdrop} alt="" aria-hidden="true" />
        : <div className="discover-hero-backdrop discover-hero-backdrop-fallback" />
      }
      <div className="discover-hero-overlay">
        <span className="discover-hero-badge">Trending #1</span>
        <h2 className="discover-hero-title">{title}</h2>
        {year && <p className="discover-hero-meta">{year} · {type === 'tv' ? 'TV Series' : 'Movie'}</p>}
        <div className="discover-hero-actions" onClick={e => e.stopPropagation()}>
          <button
            className={`discover-hero-save${saved ? ' saved' : ''}`}
            onClick={() => watchlist.toggle({ ...item })}
            disabled={watchlist.loading}
          >
            {saved ? 'Saved' : 'Save'}
          </button>
          <button className="discover-hero-info" onClick={() => openPanel(item.id, type)}>
            More Info
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Chart row ── */
function ChartRow({ item, rank, openPanel, watchlist }) {
  const title = item.title || item.name;
  const img   = posterUrl(item.poster_path, 'w92');
  const type  = item.media_type || 'movie';
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const saved = watchlist.isInList(item.id);

  return (
    <div className="discover-chart-row" onClick={() => openPanel(item.id, type)}>
      <span className={`discover-chart-rank${rank <= 10 ? ' glow' : ' dim'}`}>{rank}</span>
      <div className="discover-chart-poster">
        {img
          ? <img src={img} alt={title} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <div style={{ width: '100%', height: '100%', background: 'var(--surface-sunken)' }} />
        }
      </div>
      <div className="discover-chart-info">
        <div className="discover-chart-title">{title}</div>
        <div className="discover-chart-meta">{year}{year ? ' · ' : ''}{type === 'tv' ? 'TV' : 'Movie'}</div>
      </div>
      <div className="discover-chart-right">
        <button
          className={`card-save-btn${saved ? ' saved' : ''}`}
          style={{ position: 'static', width: 28, height: 28 }}
          onClick={e => { e.stopPropagation(); watchlist.toggle({ ...item }); }}
          aria-label={saved ? 'Remove from list' : 'Add to list'}
          disabled={watchlist.loading}
        >
          <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>
    </div>
  );
}

/* ── Platform section (collapsible) ── */
function PlatformSection({ platform, openPanel, watchlist }) {
  const [open, setOpen] = useState(false);
  const totalItems = platform.movies.length + platform.tv.length;
  if (!totalItems) return null;

  return (
    <div className="discover-plat-section">
      <button className="discover-plat-header" onClick={() => setOpen(o => !o)}>
        <div className="discover-plat-header-left">
          {platform.logo_path
            ? <img className="discover-plat-logo" src={`https://image.tmdb.org/t/p/w45${platform.logo_path}`} alt={platform.name} />
            : <div className="discover-plat-logo discover-plat-logo-fallback">{platform.name.slice(0, 2)}</div>
          }
          <span className="discover-plat-name">Top 10 on {platform.name}</span>
        </div>
        <svg
          className={`discover-plat-chevron${open ? ' open' : ''}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="discover-plat-body">
          {platform.movies.length > 0 && (
            <>
              <div className="discover-plat-type-label">Movies</div>
              <div className="discover-plat-grid">
                {platform.movies.slice(0, 10).map((item, i) => (
                  <div key={item.id} className="media-card" onClick={() => openPanel(item.id, 'movie')}>
                    <div className="media-card-img">
                      {posterUrl(item.poster_path, 'w185')
                        ? <img src={posterUrl(item.poster_path, 'w185')} alt={item.title || item.name} loading="lazy" />
                        : <div className="media-card-img-placeholder" />
                      }
                      <SaveBtn item={item} watchlist={watchlist} />
                      <span className="discover-rank-badge">{i + 1}</span>
                    </div>
                    <div className="media-card-title">{item.title || item.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {platform.tv.length > 0 && (
            <>
              <div className="discover-plat-type-label">TV Shows</div>
              <div className="discover-plat-grid">
                {platform.tv.slice(0, 10).map((item, i) => (
                  <div key={item.id} className="media-card" onClick={() => openPanel(item.id, 'tv')}>
                    <div className="media-card-img">
                      {posterUrl(item.poster_path, 'w185')
                        ? <img src={posterUrl(item.poster_path, 'w185')} alt={item.title || item.name} loading="lazy" />
                        : <div className="media-card-img-placeholder" />
                      }
                      <SaveBtn item={item} watchlist={watchlist} />
                      <span className="discover-rank-badge">{i + 1}</span>
                    </div>
                    <div className="media-card-title">{item.title || item.name}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Discover tab content ── */
function DiscoverContent({ openPanel, watchlist, providers }) {
  const { data, loading } = useDiscover(providers);

  if (loading) return <DiscoverSkeleton />;

  const { hero, hotRail, weekly, platforms } = data;
  const platformList = Object.values(platforms);
  const hasContent = hero || hotRail.length > 0 || weekly.length > 0 || platformList.length > 0;

  if (!hasContent) {
    return (
      <div className="empty-state" style={{ marginTop: '1rem' }}>
        <div className="empty-title">Discovery unavailable</div>
        <div className="empty-body">Trending and platform picks could not load right now. Try again shortly.</div>
      </div>
    );
  }

  return (
    <div>
      {hero && <HeroCard item={hero} openPanel={openPanel} watchlist={watchlist} />}

      {hotRail.length > 0 && (
        <section style={{ paddingTop: '1rem' }}>
          <div className="date-group-header" style={{ paddingTop: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Trending today</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Hot Right Now</div>
            </div>
          </div>
          <Rail>
            {hotRail.map((item, i) => (
              <RankedCard key={item.id} item={item} rank={i + 2} showRank={false} openPanel={openPanel} watchlist={watchlist} />
            ))}
          </Rail>
        </section>
      )}

      {weekly.length > 0 && (
        <section>
          <div className="date-group-header" style={{ paddingTop: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Global ranking</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Top 20 This Week</div>
            </div>
          </div>
          {weekly.map((item, i) => (
            <ChartRow key={item.id} item={item} rank={i + 1} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </section>
      )}

      {platformList.length > 0 && (
        <section>
          <div className="date-group-header" style={{ paddingTop: '0.5rem' }}>
            <div>
              <div style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.15rem' }}>Your platforms</div>
              <div style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>On Your Services</div>
            </div>
          </div>
          {platformList.map(platform => (
            <PlatformSection key={platform.id} platform={platform} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </section>
      )}

    </div>
  );
}

/* ═══════════════════════════════════════
   DiscoverView — unified home with 3 tabs
═══════════════════════════════════════ */
export default function DiscoverView() {
  const app = useApp();
  const genres        = useGenres();
  const [tab,          setTab]          = useState('discover');
  const [typeFilters,  setTypeFilters]  = useState(ALL_TYPES);
  const [genreFilters, setGenreFilters] = useState([]);

  if (!app) return null;

  const { openPanel, watchlist, profile } = app;
  const streamingProviders = profile?.streaming_providers || [];
  const guideChannels      = profile?.guide_channels      || [];

  return (
    <div className={tab === 'guide' ? 'guide-schedule-mode' : ''}>

      {/* ── Sub-tab toolbar ── */}
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel /></span>

        <div className="sub-tabs-scroll">
          <button
            className={`sub-tab-btn${tab === 'discover' ? ' active' : ''}`}
            onClick={() => setTab('discover')}
          >
            Discover
          </button>
          <button
            className={`sub-tab-btn${tab === 'releases' ? ' active' : ''}`}
            onClick={() => setTab('releases')}
          >
            Releases
          </button>
          <button
            className={`sub-tab-btn${tab === 'guide' ? ' active' : ''}`}
            onClick={() => setTab('guide')}
          >
            Guide
          </button>
        </div>

        {tab === 'releases' && (
          <div className="sub-tabs-filters">
            <MultiSelect
              placeholder="Type"
              options={[
                { id: 'tv',     label: 'TV'     },
                { id: 'cinema', label: 'Cinema' },
                { id: 'movie',  label: 'Movies' },
              ]}
              value={typeFilters}
              onChange={setTypeFilters}
            />
            {genres.length > 0 && (
              <MultiSelect
                placeholder="Genre"
                options={genres.map(g => ({ id: g.id, label: g.name }))}
                value={genreFilters}
                onChange={setGenreFilters}
              />
            )}
          </div>
        )}
      </div>

      {/* ── Tab content ── */}
      {tab === 'discover' && (
        <DiscoverContent
          openPanel={openPanel}
          watchlist={watchlist}
          providers={streamingProviders}
        />
      )}

      {tab === 'releases' && (
        <UpcomingContent
          typeFilters={typeFilters}
          genreFilters={genreFilters}
          providers={guideChannels}
          openPanel={openPanel}
          watchlist={watchlist}
        />
      )}

      {tab === 'guide' && <EpgView />}

    </div>
  );
}
