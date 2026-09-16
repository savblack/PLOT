import { useState, useEffect, useMemo } from 'react';
import { useApp } from './useApp.js';
import { useUpcoming } from '@plot/core/useUpcoming.js';
import { localDateStr } from '../utils/date.js';
import { posterUrl, backdropUrl } from '../utils/images.js';
import { tmdb, getTmdbRegion, isEnglishOriginTitle, excludeKidsContent } from '@plot/core/tmdb.js';
import { buildProviderLogoCacheKey, collectPendingProviderLogoRequests } from '../utils/providerLogos.js';
import { filterByType, filterByGenre } from '../utils/mediaFilters.js';

/* The data behind "All releases": the global upcoming feed, filtered the way
   Upcoming always filtered it, with provider logos warmed for every card.
   Loading and grouping live in @plot/core/useUpcoming.js so mobile can serve
   the same feed; the filtering and logo cache are web's. */

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

function flattenUpcomingItems(data) {
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


const hasImage = (item) => Boolean(posterUrl(item.poster_path) || backdropUrl(item.backdrop_path));
// Stable partition keeps titles without any usable artwork from breaking up
// the rail visually — they still show, just last.
const imageLast = (items) => [...items.filter(hasImage), ...items.filter(i => !hasImage(i))];

/**
 * @param {{ typeFilters: string[], genreFilters: number[] }} filters
 * @returns {{
 *   loading: boolean,
 *   days: { ds: string, items: any[] }[],   // date-ascending; today first when it has anything
 *   feedEmpty: boolean,                     // nothing at all, before filtering
 *   providerLogos: Record<string, string>,
 * }}
 */
export function useFilteredUpcoming({ typeFilters, genreFilters }) {
  const { profile } = useApp();
  const hideKids = !(profile?.include_kids_content ?? true);
  const [loadedProviderLogos, setLoadedProviderLogos] = useState({});

  const { data, loading } = useUpcoming();

  useEffect(() => {
    const items = flattenUpcomingItems(data);
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

  const days = useMemo(() => {
    if (loading) return [];
    const { today, upcomingGrouped, upcomingDates } = data;
    const applyFilters = (items) => imageLast(excludeKidsContent(
      filterByGenre(filterByType(items.filter(isEnglishOriginTitle), typeFilters), genreFilters),
      hideKids,
    ));
    const out = [];
    const todayItems = applyFilters(today);
    if (todayItems.length) out.push({ ds: localDateStr(), items: todayItems });
    for (const ds of upcomingDates) {
      const items = applyFilters(upcomingGrouped[ds]);
      if (items.length) out.push({ ds, items });
    }
    return out;
  }, [data, loading, typeFilters, genreFilters, hideKids]);

  const providerLogos = useMemo(() => {
    if (loading) return {};
    return {
      ...buildProviderLogoState(flattenUpcomingItems(data), getTmdbRegion()),
      ...loadedProviderLogos,
    };
  }, [data, loading, loadedProviderLogos]);

  const feedEmpty = !loading && flattenUpcomingItems(data).length === 0;

  return { loading, days, feedEmpty, providerLogos };
}
