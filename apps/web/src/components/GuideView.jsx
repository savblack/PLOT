import { useState, useEffect, useRef } from 'react';
import { useApp } from '../hooks/useApp.js';
import { posterUrl, backdropUrl, logoUrl } from '../utils/images.js';
import { favoriteWords } from '../utils/spelling.js';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import { useDragScroll } from '../hooks/useDragScroll.js';
import { tmdb, getTmdbRegion, isEnglishOriginTitle, excludeKidsContent } from '../api/tmdb.js';
import { buildProviderLogoCacheKey, collectPendingProviderLogoRequests } from '../utils/providerLogos.js';
import { ALL_TYPES, filterByType, filterByGenre } from '../utils/mediaFilters.js';
import LoadingSpinner from './LoadingSpinner.jsx';
import CollapsibleSection from './CollapsibleSection.jsx';
import { MEDIA } from '../copy/media.js';

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

/* ── Rail — drag-scrollable row ── */
function Rail({ children, style }) {
  const { ref, handlers } = useDragScroll();
  return (
    <div className="rail-scroll" ref={ref} {...handlers} style={style}>
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
      aria-label={saved ? MEDIA.removeFromList : MEDIA.addToList}
      disabled={watchlist.loading}
    >
      <svg viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
    </button>
  );
}

/* ── Favourite (heart) button — occupies the former type-chip slot ── */
function FavBtn({ item }) {
  const { favorites, profile } = useApp();
  const fw   = favoriteWords(profile?.region);
  const type = item.media_type || 'movie';
  const fav  = favorites.isFavorite(item.id);
  return (
    <button
      className={`card-fav-btn${fav ? ' faved' : ''}`}
      onClick={e => { e.stopPropagation(); favorites.toggleFavorite({ ...item, media_type: type }); }}
      aria-label={fav ? fw.un : fw.noun}
    >
      <svg viewBox="0 0 24 24">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
      </svg>
    </button>
  );
}

function MediaCard({ item, openPanel, providerLogo, watchlist }) {
  const img   = posterUrl(item.poster_path, 'w185') || backdropUrl(item.backdrop_path, 'w300');
  const type  = item.media_type || 'movie';
  const title = item.title || item.name;
  const year  = (item.release_date || item.first_air_date || '').slice(0, 4);
  const typeLabel = type === 'tv' ? MEDIA.tv : item._cinema ? MEDIA.cinema : MEDIA.movie;
  const meta  = [year, typeLabel].filter(Boolean).join(' · ');

  return (
    <div className="media-card" onClick={() => openPanel(item.id, type)}>
      <div className="media-card-img">
        {img
          ? <img src={img} alt={title} loading="lazy" />
          : <div className="media-card-img-placeholder" />
        }
        <FavBtn item={item} />
        <SaveBtn item={item} watchlist={watchlist} />
        {providerLogo && (
          <div className="platform-badge">
            <img src={logoUrl(providerLogo, 'w45')} alt="" />
          </div>
        )}
      </div>
      <div className="media-card-title">{title}</div>
      <div className="media-card-meta">{meta}</div>
    </div>
  );
}

/* ── Date label ── */
function formatDayLabel(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d     = new Date(dateStr + 'T00:00:00'); // force local-time parse (bare YYYY-MM-DD parses as UTC)
  const diff  = Math.round((d - today) / 86400000);
  if (diff === 0)  return MEDIA.today;
  if (diff === 1)  return MEDIA.tomorrow;
  if (diff === -1) return MEDIA.yesterday;
  return d.toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric' });
}

/* ── Shared expand-all/collapse-all signal ── */
function useControlledOpen(expandSignal, defaultOpen) {
  const [open, setOpen] = useState(defaultOpen);
  const initialToken = useRef(expandSignal?.token);
  useEffect(() => {
    if (!expandSignal || expandSignal.token === initialToken.current) return;
    setOpen(expandSignal.open);
  }, [expandSignal]);
  return [open, setOpen];
}

/* ── Collapsible date group ── */
function DateGroup({ label, items, openPanel, providerLogos, watchlist, defaultOpen = true, expandSignal }) {
  const [open, setOpen] = useControlledOpen(expandSignal, defaultOpen);
  const region = getTmdbRegion();
  if (!items.length) return null;
  return (
    <CollapsibleSection id={`guide-date-${label}`} label={label} open={open} onOpenChange={setOpen}>
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
    </CollapsibleSection>
  );
}

/* ── Upcoming content (global, date-grouped) ── */
export function UpcomingContent({ typeFilters, genreFilters, providers, openPanel, watchlist, expandSignal }) {
  const { profile } = useApp();
  const hideKids = !(profile?.include_kids_content ?? true);
  const [data,       setData]       = useState({ today: [], upcomingGrouped: {}, upcomingDates: [] });
  const [loading,    setLoading]    = useState(true);
  const [loadedProviderLogos, setLoadedProviderLogos] = useState({});

  const providerIds = providers.map(p => p.id);
  // "My Channels" (guide_channels) are free/ad-supported broadcast providers,
  // not subscription streaming — TMDB's default 'flatrate' monetization
  // filter would silently exclude them, so widen it here.
  const monetizationTypes = 'free|ads';

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Use local date string so UTC+ users (e.g. Australia) get the correct local "today"
      const todayStr = localDateStr();

      const [upcomingMovRes, upcomingTVRes] = await Promise.all([
        tmdb.getUpcoming(providerIds, monetizationTypes),
        tmdb.getUpcomingTV(providerIds, monetizationTypes),
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

      setData({ today: todayItems, upcomingGrouped, upcomingDates });
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

  const { today, upcomingGrouped, upcomingDates } = data;

  const hasImage = (item) => Boolean(posterUrl(item.poster_path) || backdropUrl(item.backdrop_path));
  // Stable partition keeps titles without any usable artwork from breaking up the rail visually — they still show, just last.
  const imageLast = (items) => [...items.filter(hasImage), ...items.filter(i => !hasImage(i))];

  const applyFilters = (items) => imageLast(excludeKidsContent(filterByGenre(filterByType(items.filter(isEnglishOriginTitle), typeFilters), genreFilters), hideKids));

  const filteredToday = applyFilters(today);
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

  const hasContent = filteredToday.length > 0 || filteredUpDates.length > 0;

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
      <DateGroup label={MEDIA.today} items={filteredToday} openPanel={openPanel} providerLogos={providerLogos} watchlist={watchlist} defaultOpen expandSignal={expandSignal} />

      {filteredUpDates.map(date => (
        <DateGroup
          key={date}
          label={formatDayLabel(date)}
          items={filteredUpcoming[date]}
          openPanel={openPanel}
          providerLogos={providerLogos}
          watchlist={watchlist}
          defaultOpen
          expandSignal={expandSignal}
        />
      ))}
    </div>
  );
}
