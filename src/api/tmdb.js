import { localDateStr, dateToLocalStr } from '../utils/date.js';

const PROXY_URL       = import.meta.env.VITE_TMDB_PROXY_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let userRegion = 'US';
export const setTmdbRegion = (region) => { userRegion = region; };
export const getTmdbRegion = () => userRegion;

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS   = [400, 1200]; // ms — 2 retries with backoff

const fetchFromTMDB = async (endpoint, params = {}) => {
  const queryParams = new URLSearchParams({
    path: endpoint.replace(/^\//, ''),
    language: 'en-US',
    region: userRegion,
    ...params,
  });

  if (!PROXY_URL) {
    console.error('TMDB Fetch Error: VITE_TMDB_PROXY_URL is not configured');
    return null;
  }

  const url = `${PROXY_URL}?${queryParams}`;
  const headers = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
  };

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        if (RETRY_STATUSES.has(response.status) && attempt < RETRY_DELAYS.length) {
          await new Promise(res => setTimeout(res, RETRY_DELAYS[attempt]));
          continue;
        }
        console.error(`TMDB Proxy Error: ${response.status} ${endpoint}`);
        return null;
      }
      return await response.json();
    } catch (error) {
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(res => setTimeout(res, RETRY_DELAYS[attempt]));
        continue;
      }
      console.error('TMDB Fetch Error:', error);
      return null;
    }
  }
  return null;
};

export const tmdb = {
  /* ── Search ── */
  search: (query) => fetchFromTMDB('/search/multi', { query }),
  resolveTitle: async (query, mediaType) => {
    const data = await fetchFromTMDB('/search/multi', { query });
    const results = data?.results || [];
    return results.find(result => result.media_type === mediaType) || null;
  },

  /* ── Trending ── */
  getTrending: async (type = 'all', time = 'day') => {
    const pages = await Promise.all(
      [1, 2, 3].map(page => fetchFromTMDB(`/trending/${type}/${time}`, { page }))
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── Details ── */
  getMovieDetails: (id) =>
    fetchFromTMDB(`/movie/${id}`, { append_to_response: 'watch/providers,recommendations,videos' }),
  getTVDetails: (id) =>
    fetchFromTMDB(`/tv/${id}`, { append_to_response: 'watch/providers,recommendations,videos' }),

  /* ── Digital (streaming) release date for a movie, by region ── */
  getDigitalReleaseDate: async (movieId) => {
    const data = await fetchFromTMDB(`/movie/${movieId}/release_dates`);
    const entries = data?.results || [];
    // Prefer the user's region, fall back to US
    const forRegion = (r) => entries.find(e => e.iso_3166_1 === r)?.release_dates || [];
    const dates = forRegion(userRegion).length ? forRegion(userRegion) : forRegion('US');
    const digital = dates.find(d => d.type === 4); // 4 = Digital
    return digital?.release_date ? digital.release_date.slice(0, 10) : null;
  },

  /* ── Season & Episode (new) ── */
  getSeason: (tvId, seasonNumber) =>
    fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}`),
  getEpisode: (tvId, seasonNumber, episodeNumber) =>
    fetchFromTMDB(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`),

  /* ── Recommendations ── */
  getRecommendations: (type, id) => fetchFromTMDB(`/${type}/${id}/recommendations`),

  /* ── Upcoming movies (optionally filtered to specific providers) ── */
  getUpcoming: async (providerIds = []) => {
    const today = localDateStr();
    const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6);
    const end = dateToLocalStr(sixMonths);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: 'flatrate' }
      : {};
    const baseParams = { 'release_date.gte': today, 'release_date.lte': end, sort_by: 'popularity.desc', ...providerParams };
    const [theatricalPages, streamingPages] = await Promise.all([
      Promise.all([1, 2, 3, 4, 5].map(page =>
        fetchFromTMDB('/discover/movie', { ...baseParams, 'with_release_type': '2|3', page })
      )),
      Promise.all([1, 2, 3].map(page =>
        fetchFromTMDB('/discover/movie', { ...baseParams, 'with_release_type': '4', page })
      )),
    ]);
    const theatrical = theatricalPages.flatMap(p => p?.results ?? []).map(m => ({ ...m, _cinema: true }));
    const theatricalIds = new Set(theatrical.map(m => m.id));
    const streaming = streamingPages.flatMap(p => p?.results ?? [])
      .filter(m => !theatricalIds.has(m.id))
      .map(m => ({ ...m, _cinema: false }));
    return { results: [...theatrical, ...streaming] };
  },

  /* ── Now playing in cinemas ── */
  getNowPlaying: async () => {
    const pages = await Promise.all(
      [1, 2].map(page => fetchFromTMDB('/movie/now_playing', { page }))
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── TV on the air ── */
  getTVOnTheAir: async () => {
    const pages = await Promise.all(
      [1, 2, 3].map(page => fetchFromTMDB('/tv/on_the_air', { page }))
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── Airing today ── */
  getAiringToday: async () => {
    const pages = await Promise.all(
      [1, 2].map(page => fetchFromTMDB('/tv/airing_today', { page }))
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── Upcoming TV (optionally filtered to specific providers) ── */
  getUpcomingTV: async (providerIds = []) => {
    const today = localDateStr();
    const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6);
    const end = dateToLocalStr(sixMonths);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: 'flatrate' }
      : {};
    const pages = await Promise.all(
      [1, 2, 3].map(page =>
        fetchFromTMDB('/discover/tv', {
          'first_air_date.gte': today,
          'first_air_date.lte': end,
          sort_by: 'first_air_date.asc',
          page,
          ...providerParams,
        })
      )
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── Watch providers ── */
  getWatchProviders: (id, type) =>
    fetchFromTMDB(`/${type}/${id}/watch/providers`),
  getWatchProvidersForRegion: (type, region) =>
    fetchFromTMDB(`/watch/providers/${type}`, { watch_region: region }),

  /* ── Channel providers only (free / ad-supported, not subscription streaming) ── */
  getChannelProviders: async (region) => {
    // Step 1: discover TV shows available via free or ad-supported monetization
    const [freeRes, adsRes] = await Promise.all([
      fetchFromTMDB('/discover/tv', {
        watch_region: region,
        with_watch_monetization_types: 'free',
        sort_by: 'popularity.desc',
        page: 1,
      }),
      fetchFromTMDB('/discover/tv', {
        watch_region: region,
        with_watch_monetization_types: 'ads',
        sort_by: 'popularity.desc',
        page: 1,
      }),
    ]);

    const showIds = [...new Set([
      ...(freeRes?.results || []).slice(0, 6).map(s => s.id),
      ...(adsRes?.results  || []).slice(0, 6).map(s => s.id),
    ])];

    if (!showIds.length) return [];

    // Step 2: fetch watch provider data for those shows and collect free/ads provider IDs
    const providerResults = await Promise.all(
      showIds.map(id => fetchFromTMDB(`/tv/${id}/watch/providers`))
    );

    const freeProviderIds = new Set();
    providerResults.forEach(res => {
      const regionData = res?.results?.[region];
      (regionData?.free || []).forEach(p => freeProviderIds.add(p.provider_id));
      (regionData?.ads  || []).forEach(p => freeProviderIds.add(p.provider_id));
    });

    if (!freeProviderIds.size) return [];

    // Step 3: get the full provider list and keep only the free/ads ones
    const allProviders = await fetchFromTMDB('/watch/providers/tv', { watch_region: region });
    return (allProviders?.results || [])
      .filter(p => freeProviderIds.has(p.provider_id))
      .sort((a, b) => a.display_priority - b.display_priority);
  },

  /* ── Discover by provider ── */
  discoverByProviders: (type, providerIds, region, extra = {}) =>
    fetchFromTMDB(`/discover/${type}`, {
      watch_region: region || userRegion,
      with_watch_providers: Array.isArray(providerIds) ? providerIds.join('|') : providerIds,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      'vote_count.gte': 20,
      ...extra,
    }),

  /* ── Discover by date window + providers ── */
  discoverNewByProviders: (type, providerIds, daysAgo = 14) => {
    const end = localDateStr();
    const startStr = localDateStr(-daysAgo);
    const dateKey = type === 'movie' ? 'primary_release_date' : 'first_air_date';
    return fetchFromTMDB(`/discover/${type}`, {
      watch_region: userRegion,
      with_watch_providers: Array.isArray(providerIds) ? providerIds.join('|') : providerIds,
      with_watch_monetization_types: 'flatrate',
      [`${dateKey}.gte`]: startStr,
      [`${dateKey}.lte`]: end,
      sort_by: 'popularity.desc',
    });
  },

  /* ── Streaming now ── */
  getStreamingMovies: async () => {
    const pages = await Promise.all(
      [1, 2, 3].map(page =>
        fetchFromTMDB('/discover/movie', {
          watch_region: userRegion,
          with_watch_monetization_types: 'flatrate',
          sort_by: 'popularity.desc',
          'vote_count.gte': 50,
          page,
        })
      )
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  getStreamingTV: async () => {
    const pages = await Promise.all(
      [1, 2, 3].map(page =>
        fetchFromTMDB('/discover/tv', {
          watch_region: userRegion,
          with_watch_monetization_types: 'flatrate',
          sort_by: 'popularity.desc',
          'vote_count.gte': 50,
          page,
        })
      )
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── Recently released (past N days, optionally filtered to specific providers) ── */
  getRecentReleases: async (days = 14, providerIds = []) => {
    const endStr   = localDateStr();
    const startStr = localDateStr(-days);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: 'flatrate' }
      : {};
    const movieBase = { 'release_date.gte': startStr, 'release_date.lte': endStr, sort_by: 'popularity.desc', ...providerParams };
    const [tvRes, theatricalRes, streamingRes] = await Promise.all([
      fetchFromTMDB('/discover/tv', {
        'first_air_date.gte': startStr,
        'first_air_date.lte': endStr,
        sort_by: 'popularity.desc',
        'vote_count.gte': 3,
        ...providerParams,
      }),
      fetchFromTMDB('/discover/movie', { ...movieBase, 'with_release_type': '2|3' }),
      fetchFromTMDB('/discover/movie', { ...movieBase, 'with_release_type': '4' }),
    ]);
    const theatrical = (theatricalRes?.results || []).map(m => ({ ...m, media_type: 'movie', _cinema: true }));
    const theatricalIds = new Set(theatrical.map(m => m.id));
    const streaming = (streamingRes?.results || [])
      .filter(m => !theatricalIds.has(m.id))
      .map(m => ({ ...m, media_type: 'movie', _cinema: false }));
    return {
      tv:     (tvRes?.results || []).map(s => ({ ...s, media_type: 'tv' })),
      movies: [...theatrical, ...streaming],
    };
  },

  /* ── Browse / discover ── */
  discoverBrowse: (type, { sortBy = 'popularity.desc', genreId, minRating } = {}) => {
    const params = { sort_by: sortBy, 'vote_count.gte': 100 };
    if (genreId)    params.with_genres = genreId;
    if (minRating)  params['vote_average.gte'] = minRating;
    return fetchFromTMDB(`/discover/${type}`, params);
  },

  getTopRated: (type) => fetchFromTMDB(`/${type}/top_rated`),

  discoverByGenres: (type, genreIds) => {
    if (!genreIds?.length) return Promise.resolve(null);
    return fetchFromTMDB(`/discover/${type}`, {
      with_genres: genreIds.join('|'),
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    });
  },

  /* ── Combined genre list (movie + TV, deduplicated) ── */
  getGenres: async () => {
    const [movieRes, tvRes] = await Promise.all([
      fetchFromTMDB('/genre/movie/list'),
      fetchFromTMDB('/genre/tv/list'),
    ]);
    const all = new Map();
    [...(movieRes?.genres || []), ...(tvRes?.genres || [])].forEach(g => all.set(g.id, g));
    return [...all.values()].sort((a, b) => a.name.localeCompare(b.name));
  },
};
