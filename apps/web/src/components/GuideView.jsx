import { useState, useEffect } from 'react';
import { useApp, posterUrl, logoUrl, TodayLabel } from '../App.jsx';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { useGenres } from '../hooks/useGenres.js';
import { tmdb, getTmdbRegion } from '../api/tmdb.js';
import { buildProviderLogoCacheKey, collectPendingProviderLogoRequests } from '../utils/providerLogos.js';
import EpgView from './EpgView.jsx';
import LoadingSpinner from './LoadingSpinner.jsx';
import GroupedFilterMenu from './GroupedFilterMenu.jsx';

/* ── Module-level provider logo cache (keyed with region to avoid stale logos after region change) ── */
const _providerCache = new Map();
const _providerInflight = new Map();

function getProviderLogo(id, type, region = getTmdbRegion()) {
  const key = buildProviderLogoCacheKey({ id, type, region });
  return _providerCache.get(key) ?? null;
}

async function loadProviderLogo(id, type, region = getTmdbRegion()) {
  const key = buildProviderLogoCacheKey({ id, type, region });
  if (_providerCache.has(key)) return _providerCache.get(key);
  if (_providerInflight.has(key)) return _providerInflight.get(key);

  const request = tmdb.getWatchProviders(id, type).then(data => {
    const providers = data?.results?.[region]?.flatrate || [];
    const logo = providers[0]?.logo_path || null;
    _providerCache.set(key, logo);
    _providerInflight.delete(key);
    return logo;
  }).catch(error => {
    _providerInflight.delete(key);
    throw error;
  });

  _providerInflight.set(key, request);
  return request;
}

async function warmProviderLogoCache(items, region) {
  const requests = collectPendingProviderLogoRequests(items, region, _providerCache);
  const loaded = {};

  for (let i = 0; i < requests.length; i += 4) {
    const chunk = requests.slice(i, i + 4);
    const results = await Promise.all(
      chunk.map(async request => {
        const logo = await loadProviderLogo(request.id, request.type, region);
        return [request.key, logo];
      })
    );

    results.forEach(([key, logo]) => {
      if (logo) loaded[key] = logo;
    });
  }

  return loaded;
}

function flattenGuideItems(data) {
  return [
    ...data.today,
    ...data.recentDates.flatMap(date => data.recentGrouped[date] || []),
    ...data.upcomingDates.flatMap(date => data.upcomingGrouped[date] || []),
  ];
}

function buildProviderLogoState(items, region) {
  return items.reduce((acc, item) => {
    const id = item?.id || item?.tmdb_id;
    const type = item?.media_type || 'movie';
    if (!id) return acc;

    const logo = getProviderLogo(id, type, region);
    if (logo) {
      acc[buildProviderLogoCacheKey({ id, type, region })] = logo;
    }
    return acc;
  }, {});
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
  return                    <span className="chip chip-streaming">Movie</span>;
}

function MediaCard({ item, openPanel, providerLogo, watchlist }) {
  const img   = posterUrl(item.poster_path, 'w185');
  const type  = item.media_type || 'movie';
  const title = item.title || item.name;

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
  const d     = new Date(dateStr + 'T00:00:00'); // force local-time parse (bare YYYY-MM-DD parses as UTC)
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return 'Today';
  if (diff === 1)  return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ── Collapsible date group ── */
function DateGroup({ label, items, openPanel, providerLogos, watchlist, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const region = getTmdbRegion();
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
            <MediaCard
              key={`${item.media_type}-${item.id}`}
              item={item}
              openPanel={openPanel}
              providerLogo={providerLogos[buildProviderLogoCacheKey({
                id: item.id || item.tmdb_id,
                type: item.media_type || 'movie',
                region,
              })] || null}
              watchlist={watchlist}
            />
          ))}
        </Rail>
      )}
    </div>
  );
}

/* ── Upcoming content (global, date-grouped) ── */
export function UpcomingContent({ typeFilters, genreFilters, providers, openPanel, watchlist }) {
  const [data,       setData]       = useState({ today: [], recentGrouped: {}, recentDates: [], upcomingGrouped: {}, upcomingDates: [] });
  const [loading,    setLoading]    = useState(true);
  const [loadedProviderLogos, setLoadedProviderLogos] = useState({});
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
          todayItems.push({ ...m, media_type: 'movie', release_date: null });
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
        .sort((a, b) => b.localeCompare(a))
        .filter(d => recentGrouped[d].length > 0);

      const upcomingGrouped = {};

      const sixMonthsStr = (() => { const d = new Date(); d.setMonth(d.getMonth() + 6); return dateToLocalStr(d); })();
      for (const movie of (upcomingMovRes?.results || [])) {
        if (seenIds.has(movie.id)) continue;
        const d = movie.release_date;
        if (d && d > todayStr && d <= sixMonthsStr) {
          if (!upcomingGrouped[d]) upcomingGrouped[d] = [];
          upcomingGrouped[d].push({ ...movie, media_type: 'movie' });
          seenIds.add(movie.id);
        }
      }
      for (const show of (upcomingTVRes?.results || [])) {
        if (seenIds.has(show.id)) continue;
        const d = show.first_air_date;
        if (d && d > todayStr && d <= sixMonthsStr) {
          if (!upcomingGrouped[d]) upcomingGrouped[d] = [];
          upcomingGrouped[d].push({ ...show, media_type: 'tv', first_air_date: null });
          seenIds.add(show.id);
        }
      }
      const upcomingDates = Object.keys(upcomingGrouped).sort();

      setData({ today: todayItems, recentGrouped, recentDates, upcomingGrouped, upcomingDates });
      setLoading(false);
    }
    load();
  }, [providerIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const items = flattenGuideItems(data);
    const region = getTmdbRegion();
    if (!items.length) return;

    let cancelled = false;

    (async () => {
      const loaded = await warmProviderLogoCache(items, region);
      if (!cancelled && Object.keys(loaded).length) {
        setLoadedProviderLogos(prev => ({ ...prev, ...loaded }));
      }
    })();

    return () => { cancelled = true; };
  }, [data]);

  if (loading) return <LoadingSpinner />;

  const { today, recentGrouped, recentDates, upcomingGrouped, upcomingDates } = data;

  const applyFilters = (items) => filterByGenre(filterByType(items, typeFilters), genreFilters);

  const filteredToday = applyFilters(today);
  const filteredRecent = {};
  const filteredRecDates = recentDates.filter(d => {
    const arr = applyFilters(recentGrouped[d]);
    if (arr.length) { filteredRecent[d] = arr; return true; }
    return false;
  });
  const filteredUpcoming = {};
  const filteredUpDates = upcomingDates.filter(d => {
    const arr = applyFilters(upcomingGrouped[d]);
    if (arr.length) { filteredUpcoming[d] = arr; return true; }
    return false;
  });
  const currentRegion = getTmdbRegion();
  const providerLogos = {
    ...buildProviderLogoState(flattenGuideItems(data), currentRegion),
    ...loadedProviderLogos,
  };

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
    <div className="upcoming-content">
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
                  <MediaCard
                    key={`${item.media_type}-${item.id}`}
                    item={item}
                    openPanel={openPanel}
                    providerLogo={providerLogos[buildProviderLogoCacheKey({
                      id: item.id || item.tmdb_id,
                      type: item.media_type || 'movie',
                      region: currentRegion,
                    })] || null}
                    watchlist={watchlist}
                  />
                ))}
              </Rail>
            </div>
          ))}
        </div>
      )}

      <DateGroup label="Today" items={filteredToday} openPanel={openPanel} providerLogos={providerLogos} watchlist={watchlist} defaultOpen />

      {filteredUpDates.map(date => (
        <DateGroup
          key={date}
          label={formatDayLabel(date)}
          items={filteredUpcoming[date]}
          openPanel={openPanel}
          providerLogos={providerLogos}
          watchlist={watchlist}
          defaultOpen
        />
      ))}
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
            <GroupedFilterMenu
              ariaLabel="Filter releases"
              groups={[
                {
                  heading: 'Type',
                  options: [
                    { id: 'tv',     label: 'TV'     },
                    { id: 'cinema', label: 'Cinema' },
                    { id: 'movie',  label: 'Movies' },
                  ],
                  value: typeFilters,
                  onChange: setTypeFilters,
                },
                {
                  heading: 'Genre',
                  options: genres.map(g => ({ id: g.id, label: g.name })),
                  value: genreFilters,
                  onChange: setGenreFilters,
                },
              ]}
            />
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
