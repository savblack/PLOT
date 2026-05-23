import { useState, useEffect } from 'react';
import { useApp, posterUrl, logoUrl, TodayLabel } from '../App.jsx';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { useGenres } from '../hooks/useGenres.js';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';
import EpgView from './EpgView.jsx';
import MultiSelect from './MultiSelect.jsx';

/* ── Module-level provider logo cache ── */
const _providerCache = new Map();
async function getProviderLogo(id, type) {
  const key = `${type}-${id}`;
  if (_providerCache.has(key)) return _providerCache.get(key);
  const data = await tmdb.getWatchProviders(id, type);
  const region = getTmdbRegion();
  const providers = data?.results?.[region]?.flatrate || [];
  const logo = providers[0]?.logo_path || null;
  _providerCache.set(key, logo);
  return logo;
}

/* ── Type filter helper ── */
const ALL_TYPES = ['tv', 'cinema', 'movie'];
function filterByType(items, typeFilters) {
  if (!typeFilters.length || typeFilters.length === ALL_TYPES.length) return items;
  return items.filter(i => {
    if (typeFilters.includes('tv')     && i.media_type === 'tv')                   return true;
    if (typeFilters.includes('cinema') && i._cinema === true)                      return true;
    if (typeFilters.includes('movie')  && i.media_type === 'movie' && !i._cinema)  return true;
    return false;
  });
}

/* ── Genre filter helper ── */
function filterByGenre(items, genreFilters) {
  if (!genreFilters.length) return items;
  return items.filter(i =>
    !i.genre_ids?.length || i.genre_ids.some(id => genreFilters.includes(id))
  );
}

/* ── Rail — drag-scrollable row ── */
function Rail({ children, style }) {
  const { ref, handlers } = useDragScroll();
  return (
    <div className="rail-scroll" ref={ref} {...handlers} style={style}>
      {children}
    </div>
  );
}

/* ── Chevron SVG ── */
function Chevron({ open }) {
  return (
    <svg className={`date-group-chevron${open ? ' open' : ''}`} viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
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

function TypeBadge({ type, cinema }) {
  if (type === 'tv') return <span className="chip chip-episode">TV</span>;
  if (cinema)        return <span className="chip chip-cinema">Cinema</span>;
  return                    <span className="chip chip-muted">Movie</span>;
}

function MediaCard({ item, openPanel, watchlist }) {
  const img   = posterUrl(item.poster_path, 'w185');
  const date  = item.release_date || item.first_air_date;
  const type  = item.media_type || 'movie';
  const title = item.title || item.name;
  const [providerLogo, setProviderLogo] = useState(null);

  useEffect(() => {
    let cancelled = false;
    getProviderLogo(item.id || item.tmdb_id, type).then(logo => {
      if (!cancelled && logo) setProviderLogo(logo);
    });
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="media-card" onClick={() => openPanel(item.id, type)}>
      <div className="media-card-img">
        {img
          ? <img src={img} alt={title} loading="lazy" />
          : <div className="media-card-img-placeholder" />
        }
        <div className="card-chip-overlay">
          <TypeBadge type={type} cinema={item._cinema} />
        </div>
        <SaveBtn item={item} watchlist={watchlist} />
        {providerLogo && (
          <div className="platform-badge">
            <img src={logoUrl(providerLogo, 'w45')} alt="" />
          </div>
        )}
      </div>
      <div className="media-card-title">{title}</div>
    </div>
  );
}

/* ── Date label ── */
function formatDayLabel(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(dateStr); d.setHours(0, 0, 0, 0);
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ── Collapsible date group ── */
function DateGroup({ label, items, openPanel, watchlist, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!items.length) return null;
  return (
    <div className="date-group">
      <button className="date-group-header date-group-collapsible" onClick={() => setOpen(o => !o)}>
        <span className="date-group-label">{label}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <Rail style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.25rem', paddingBottom: '1.5rem' }}>
          {items.map(item => (
            <MediaCard key={`${item.media_type}-${item.id}`} item={item} openPanel={openPanel} watchlist={watchlist} />
          ))}
        </Rail>
      )}
    </div>
  );
}

/* ── Upcoming content (global, date-grouped) ── */
function UpcomingContent({ typeFilters, genreFilters, providers, openPanel, watchlist }) {
  const [data,       setData]       = useState({ today: [], recentGrouped: {}, recentDates: [], upcomingGrouped: {}, upcomingDates: [] });
  const [loading,    setLoading]    = useState(true);
  const [recentOpen, setRecentOpen] = useState(false);

  const providerIds = providers.map(p => p.id);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Use local date string so UTC+ users (e.g. Australia) get the correct local "today"
      const todayStr = localDateStr();

      const [upcomingMovRes, upcomingTVRes, recentRes] = await Promise.all([
        tmdb.getUpcoming(providerIds),
        tmdb.getUpcomingTV(providerIds),
        tmdb.getRecentReleases(14, providerIds),
      ]);

      const todayItems = [];
      const seenIds = new Set();

      for (const s of (upcomingTVRes?.results || [])) {
        if (s.first_air_date === todayStr) {
          todayItems.push({ ...s, media_type: 'tv', first_air_date: null });
          seenIds.add(s.id);
        }
      }
      // Movies with release_date <= todayStr are currently in cinemas (handles AU theatrical releases
      // that TMDB stores with a US primary_release_date in the past but AU regional date = now)
      for (const m of (upcomingMovRes?.results || [])) {
        if (m.release_date <= todayStr) {
          todayItems.push({ ...m, media_type: 'movie', _cinema: true, release_date: null });
          seenIds.add(m.id);
        }
      }

      const recentGrouped = {};
      for (let i = 1; i <= 14; i++) recentGrouped[localDateStr(-i)] = [];
      const recentFallbackDay = localDateStr(-1);

      for (const show of (recentRes?.tv || [])) {
        if (seenIds.has(show.id)) continue;
        const d = show.first_air_date;
        const bucket = (d && recentGrouped[d] !== undefined) ? d : recentFallbackDay;
        recentGrouped[bucket].push({ ...show, first_air_date: null });
        seenIds.add(show.id);
      }
      for (const movie of (recentRes?.movies || [])) {
        if (seenIds.has(movie.id)) continue;
        const d = movie.release_date;
        const bucket = (d && recentGrouped[d] !== undefined) ? d : recentFallbackDay;
        recentGrouped[bucket].push({ ...movie, release_date: null });
        seenIds.add(movie.id);
      }
      const recentDates = Object.keys(recentGrouped)
        .sort((a, b) => new Date(b) - new Date(a))
        .filter(d => recentGrouped[d].length > 0);

      const upcomingGrouped = {};
      for (let i = 1; i <= 60; i++) upcomingGrouped[localDateStr(i)] = [];

      for (const movie of (upcomingMovRes?.results || [])) {
        if (seenIds.has(movie.id)) continue;
        const d = movie.release_date;
        if (d && d > todayStr && upcomingGrouped[d] !== undefined) {
          upcomingGrouped[d].push({ ...movie, media_type: 'movie', _cinema: true });
          seenIds.add(movie.id);
        }
      }
      for (const show of (upcomingTVRes?.results || [])) {
        if (seenIds.has(show.id)) continue;
        const d = show.first_air_date;
        if (d && d > todayStr && upcomingGrouped[d] !== undefined) {
          upcomingGrouped[d].push({ ...show, media_type: 'tv', first_air_date: null });
          seenIds.add(show.id);
        }
      }
      const upcomingDates = Object.keys(upcomingGrouped).sort().filter(d => upcomingGrouped[d].length > 0);

      setData({ today: todayItems, recentGrouped, recentDates, upcomingGrouped, upcomingDates });
      setLoading(false);
    }
    load();
  }, [JSON.stringify(providerIds)]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <div className="loading-state"><div className="spinner" /></div>;

  const { today, recentGrouped, recentDates, upcomingGrouped, upcomingDates } = data;

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);

  const filteredToday    = applyFilters(today);
  const filteredRecent   = Object.fromEntries(recentDates.map(d => [d, applyFilters(recentGrouped[d])]));
  const filteredRecDates = recentDates.filter(d => filteredRecent[d].length > 0);
  const filteredUpcoming = Object.fromEntries(upcomingDates.map(d => [d, applyFilters(upcomingGrouped[d])]));
  const filteredUpDates  = upcomingDates.filter(d => filteredUpcoming[d].length > 0);

  const hasContent = filteredToday.length > 0 || filteredRecDates.length > 0 || filteredUpDates.length > 0;

  if (!hasContent) {
    const allSelected = typeFilters.length === ALL_TYPES.length || typeFilters.length === 0;
    return (
      <div className="empty-state">
        <div className="empty-title">
          {allSelected ? 'Unavailable right now' : 'Nothing matching this filter'}
        </div>
        <div className="empty-body">
          {allSelected ? 'New releases will appear here. Check back soon.' : 'Try selecting a different type.'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: '0.5rem' }}>
      {/* Recently Released — collapsible, collapsed by default */}
      {filteredRecDates.length > 0 && (
        <div className="date-group">
          <button className="date-group-header date-group-collapsible" onClick={() => setRecentOpen(o => !o)}>
            <span className="date-group-label">Recently Released</span>
            <Chevron open={recentOpen} />
          </button>
          {recentOpen && filteredRecDates.map(date => (
            <div key={date}>
              <div className="date-group-subheader">{formatDayLabel(date)}</div>
              <Rail style={{ paddingLeft: '1rem', paddingRight: '1rem', paddingTop: '1.25rem', paddingBottom: '1.5rem' }}>
                {filteredRecent[date].map(item => (
                  <MediaCard key={`${item.media_type}-${item.id}`} item={item} openPanel={openPanel} watchlist={watchlist} />
                ))}
              </Rail>
            </div>
          ))}
        </div>
      )}

      <DateGroup label="Today"   items={filteredToday} openPanel={openPanel} watchlist={watchlist} defaultOpen />

      {filteredUpDates.map(date => (
        <DateGroup key={date} label={formatDayLabel(date)} items={filteredUpcoming[date]} openPanel={openPanel} watchlist={watchlist} defaultOpen />
      ))}
    </div>
  );
}

/* ── Platform content (trending on a specific platform) ── */
function PlatformContent({ rail, typeFilters, genreFilters, openPanel, watchlist }) {
  if (!rail) {
    return (
      <div className="empty-state">
        <div className="empty-title">No content found</div>
        <div className="empty-body">Try a different platform or filter.</div>
      </div>
    );
  }

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);
  const tvItems    = applyFilters(rail.items.filter(i => i.media_type === 'tv'));
  const movieItems = applyFilters(rail.items.filter(i => i.media_type === 'movie'));

  return (
    <div style={{ paddingTop: '1rem' }}>
      {tvItems.length > 0 && (
        <div className="section-rail">
          <div className="rail-header">
            {rail.provider.logo_path && (
              <img src={logoUrl(rail.provider.logo_path, 'w45')} alt="" style={{ width: 18, height: 18, borderRadius: 4 }} />
            )}
            <span className="rail-title">Trending on {rail.provider.name}</span>
          </div>
          <Rail>
            {tvItems.map(item => (
              <MediaCard key={item.id} item={item} openPanel={openPanel} watchlist={watchlist} />
            ))}
          </Rail>
        </div>
      )}
      {movieItems.length > 0 && (
        <div className="section-rail">
          <div className="rail-header">
            <span className="rail-dot dot-movie" />
            <span className="rail-title">Movies on {rail.provider.name}</span>
          </div>
          <Rail>
            {movieItems.map(item => (
              <MediaCard key={item.id} item={item} openPanel={openPanel} watchlist={watchlist} />
            ))}
          </Rail>
        </div>
      )}
      {tvItems.length === 0 && movieItems.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">Nothing matching this filter</div>
          <div className="empty-body">Try a different type filter.</div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   GuideView
═══════════════════════════════════════ */
export default function GuideView() {
  const { openPanel, watchlist, profile } = useApp();
  const guideChannels = profile?.guide_channels || [];
  const genres = useGenres();

  const [guideTab,     setGuideTab]     = useState('releases');
  const [typeFilters,  setTypeFilters]  = useState(['tv', 'cinema', 'movie']);
  const [genreFilters, setGenreFilters] = useState([]);

  return (
    <div className={guideTab === 'onair' ? 'guide-schedule-mode' : ''}>
      {/* ── Toolbar: date left | tabs | filters right ── */}
      <div className="sub-tabs">
        <span className="sub-tabs-date"><TodayLabel /></span>
        <button
          className={`sub-tab-btn${guideTab === 'releases' ? ' active' : ''}`}
          onClick={() => setGuideTab('releases')}
        >
          Releases
        </button>
        <button
          className={`sub-tab-btn${guideTab === 'onair' ? ' active' : ''}`}
          onClick={() => setGuideTab('onair')}
        >
          Guide
        </button>
        {guideTab === 'releases' && (
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

      {guideTab === 'onair' ? (
        <EpgView />
      ) : (
        <UpcomingContent typeFilters={typeFilters} genreFilters={genreFilters} providers={guideChannels} openPanel={openPanel} watchlist={watchlist} />
      )}
    </div>
  );
}
