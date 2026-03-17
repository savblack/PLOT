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
  getUpcoming: () => fetchFromTMDB('/movie/upcoming'),
  getNowPlaying: () => fetchFromTMDB('/movie/now_playing'),
  getTVOnTheAir: () => fetchFromTMDB('/tv/on_the_air'),
  getTVTrending: () => fetchFromTMDB('/trending/tv/day'),
  getAiringToday: () => fetchFromTMDB('/tv/airing_today'),
  getWatchProviders: (id, type) => fetchFromTMDB(`/${type}/${id}/watch/providers`),
};
