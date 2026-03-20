const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const API_KEY = import.meta.env.VITE_TMDB_API_KEY;

const fetchFromTMDB = async (endpoint, params = {}) => {
  if (!API_KEY) {
    console.warn('TMDB API Key missing. Please set VITE_TMDB_API_KEY in .env');
    return null;
  }

  const queryParams = new URLSearchParams({
    api_key: API_KEY,
    language: 'en-AU',
    region: 'AU',
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
  getTrending: (type = 'all', time = 'day') => fetchFromTMDB(`/trending/${type}/${time}`),
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
  getNowPlaying: () => fetchFromTMDB('/movie/now_playing'),
  getTVOnTheAir: () => fetchFromTMDB('/tv/on_the_air'),
  getTVTrending: () => fetchFromTMDB('/trending/tv/day'),
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
};
