import { localDateStr } from '../utils/date.js';

const PROXY_URL       = import.meta.env.VITE_TMDB_PROXY_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let userRegion = 'AU';
export const setTmdbRegion = (region) => { userRegion = region; };
export const getTmdbRegion = () => userRegion;

const fetchFromTMDB = async (endpoint, params = {}) => {
  const queryParams = new URLSearchParams({
    path: endpoint.replace(/^\//, ''),
    language: 'en-US',
    region: userRegion,
    ...params,
  });

  try {
    if (!PROXY_URL) throw new Error('VITE_TMDB_PROXY_URL is not configured');
    const response = await fetch(`${PROXY_URL}?${queryParams}`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY,
      },
    });
    if (!response.ok) throw new Error(`TMDB Proxy Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('TMDB Fetch Error:', error);
    return null;
  }
};

export const tmdb = {
  /* ── Search ── */
  search: (query) => fetchFromTMDB('/search/multi', { query }),

  /* ── Trending ── */
  getTrending: async (type = 'all', time = 'day') => {
    const pages = await Promise.all(
      [1, 2, 3].map(page => fetchFromTMDB(`/trending/${type}/${time}`, { page }))
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
  },

  /* ── Details ── */
  getMovieDetails: (id) =>
    fetchFromTMDB(`/movie/${id}`, { append_to_response: 'watch/providers,recommendations' }),
  getTVDetails: (id) =>
    fetchFromTMDB(`/tv/${id}`, { append_to_response: 'watch/providers,recommendations' }),

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
    const end = `${sixMonths.getFullYear()}-${String(sixMonths.getMonth()+1).padStart(2,'0')}-${String(sixMonths.getDate()).padStart(2,'0')}`;
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: 'flatrate' }
      : {};
    const pages = await Promise.all(
      [1, 2, 3, 4, 5].map(page =>
        fetchFromTMDB('/discover/movie', {
          // release_date + with_release_type + region = use the *regional* theatrical
          // release date for filtering, not the US primary_release_date.
          // This ensures AU movies releasing locally (even after a US run) appear correctly.
          'release_date.gte': today,
          'release_date.lte': end,
          'with_release_type': '2|3', // 2 = limited theatrical, 3 = theatrical
          sort_by: 'popularity.desc',
          page,
          ...providerParams,
        })
      )
    );
    return { results: pages.flatMap(p => p?.results ?? []) };
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
    const end = `${sixMonths.getFullYear()}-${String(sixMonths.getMonth()+1).padStart(2,'0')}-${String(sixMonths.getDate()).padStart(2,'0')}`;
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
    const endStr   = localDateStr();      // include today
    const startStr = localDateStr(-days);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: 'flatrate' }
      : {};
    const [tvRes, movieRes] = await Promise.all([
      fetchFromTMDB('/discover/tv', {
        'first_air_date.gte': startStr,
        'first_air_date.lte': endStr,
        sort_by: 'popularity.desc',
        'vote_count.gte': 3,
        ...providerParams,
      }),
      fetchFromTMDB('/discover/movie', {
        // Use regional release date so AU theatrical releases aren't missed
        'release_date.gte': startStr,
        'release_date.lte': endStr,
        'with_release_type': '2|3',
        sort_by: 'popularity.desc',
        ...providerParams,
      }),
    ]);
    return {
      tv:     (tvRes?.results    || []).map(s => ({ ...s, media_type: 'tv' })),
      movies: (movieRes?.results || []).map(m => ({ ...m, media_type: 'movie', _cinema: true })),
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
