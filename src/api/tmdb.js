const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

let userRegion = 'AU';
export const setTmdbRegion = (region) => { userRegion = region; };

const fetchFromTMDB = async (endpoint, params = {}) => {
  if (!API_KEY) {
    console.warn('TMDB API Key missing. Please set VITE_TMDB_API_KEY in .env');
    return null;
  }

  const queryParams = new URLSearchParams({
    api_key: API_KEY,
    language: 'en-US',
    region: userRegion,
    ...params,
  });

  try {
    const response = await fetch(`${TMDB_BASE_URL}${endpoint}?${queryParams}`);
    if (!response.ok) throw new Error(`TMDB API Error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error('TMDB Fetch Error:', error);
    return null;
  }
};

export const tmdb = {
  search: (query) => fetchFromTMDB('/search/multi', { query }),
  getTrending: async (type = 'all', time = 'day') => {
    const pages = await Promise.all([1, 2, 3].map(page => fetchFromTMDB(`/trending/${type}/${time}`, { page })));
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  getMovieDetails: (id) => fetchFromTMDB(`/movie/${id}`, { append_to_response: 'watch/providers,recommendations' }),
  getTVDetails: (id) => fetchFromTMDB(`/tv/${id}`, { append_to_response: 'watch/providers,recommendations' }),
  getRecommendations: (type, id) => fetchFromTMDB(`/${type}/${id}/recommendations`),
  getUpcoming: async () => {
    const today = new Date().toISOString().split('T')[0];
    const sixMonthsOut = new Date(); sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
    const endDate = sixMonthsOut.toISOString().split('T')[0];
    const pages = await Promise.all([1, 2, 3, 4, 5].map(page =>
      fetchFromTMDB('/discover/movie', {
        'primary_release_date.gte': today,
        'primary_release_date.lte': endDate,
        sort_by: 'popularity.desc',
        page,
      })
    ));
    const results = pages.flatMap(p => p?.results ?? []);
    return { results };
  },
  getNowPlaying: async () => {
    const pages = await Promise.all([1, 2, 3].map(page => fetchFromTMDB('/movie/now_playing', { page })));
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  getTVOnTheAir: async () => {
    const pages = await Promise.all([1, 2, 3].map(page => fetchFromTMDB('/tv/on_the_air', { page })));
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  getTVTrending: async () => {
    const pages = await Promise.all([1, 2, 3].map(page => fetchFromTMDB('/trending/tv/day', { page })));
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  getAiringToday: () => fetchFromTMDB('/tv/airing_today'),
  getWatchProviders: (id, type) => fetchFromTMDB(`/${type}/${id}/watch/providers`),
  getUpcomingTV: () => {
    const today = new Date().toISOString().split('T')[0];
    return fetchFromTMDB('/discover/tv', {
      'first_air_date.gte': today,
      sort_by: 'first_air_date.asc',
      'vote_count.gte': 5,
    });
  },
  getStreamingMovies: async () => {
    const pages = await Promise.all([1, 2, 3].map(page =>
      fetchFromTMDB('/discover/movie', {
        watch_region: userRegion,
        with_watch_monetization_types: 'flatrate',
        sort_by: 'popularity.desc',
        'vote_count.gte': 50,
        page,
      })
    ));
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  getStreamingTV: async () => {
    const pages = await Promise.all([1, 2, 3].map(page =>
      fetchFromTMDB('/discover/tv', {
        watch_region: userRegion,
        with_watch_monetization_types: 'flatrate',
        sort_by: 'popularity.desc',
        'vote_count.gte': 50,
        page,
      })
    ));
    return { results: pages.flatMap(p => p?.results ?? []) };
  },
  discoverByGenres: (type, genreIds) => {
    if (!genreIds.length) return Promise.resolve(null);
    return fetchFromTMDB(`/discover/${type}`, {
      with_genres: genreIds.join('|'),
      sort_by: 'popularity.desc',
      'vote_count.gte': 100,
    });
  },
  discoverTopRatedByGenres: (type, genreIds) => {
    if (!genreIds.length) return Promise.resolve(null);
    return fetchFromTMDB(`/discover/${type}`, {
      with_genres: genreIds.join('|'),
      sort_by: 'vote_average.desc',
      'vote_count.gte': 300,
    });
  },
  getTopRated: (type) => fetchFromTMDB(`/${type}/top_rated`),
  getWatchProvidersForRegion: (type, region) =>
    fetchFromTMDB(`/watch/providers/${type}`, { watch_region: region }),
  discoverByProviders: (type, providerIds, region) =>
    fetchFromTMDB(`/discover/${type}`, {
      watch_region: region,
      with_watch_providers: providerIds.join('|'),
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      'vote_count.gte': 50,
    }),
};
