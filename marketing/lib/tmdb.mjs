// Server-side TMDB client for marketing scripts. Talks to api.themoviedb.org
// directly with TMDB_API_KEY (the browser app goes through the tmdb-proxy
// edge function instead). Mirrors the helpers in src/api/tmdb.js that the
// content planner needs.
const BASE = 'https://api.themoviedb.org/3';
const REGION = process.env.MARKETING_REGION || 'US'; // marketing audience skews US

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS = [400, 1200];

const apiKey = () => {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY is not set');
  return key;
};

export const fetchTMDB = async (endpoint, params = {}) => {
  const key = apiKey();
  const query = new URLSearchParams({ language: 'en-US', region: REGION, ...params });
  const headers = {};
  // v4 read tokens are JWTs (Bearer header); v3 keys go in the query string.
  if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
  else query.set('api_key', key);
  const url = `${BASE}/${endpoint.replace(/^\//, '')}?${query}`;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        if (RETRY_STATUSES.has(res.status) && attempt < RETRY_DELAYS.length) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
          continue;
        }
        throw new Error(`TMDB ${res.status} for ${endpoint}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt < RETRY_DELAYS.length) {
        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
        continue;
      }
      throw err;
    }
  }
  return null;
};

const dateStr = (offsetDays = 0) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

const flatResults = (pages) => pages.flatMap(p => p?.results ?? []);

export const tmdb = {
  search: (query) => fetchTMDB('/search/multi', { query }),

  getTrending: async (type = 'all', time = 'week') => {
    const pages = await Promise.all([1, 2].map(page => fetchTMDB(`/trending/${type}/${time}`, { page })));
    return flatResults(pages);
  },

  // Upcoming theatrical + streaming movies in the next `days`, by popularity.
  getUpcomingMovies: async (days = 180) => {
    const params = {
      'release_date.gte': dateStr(0),
      'release_date.lte': dateStr(days),
      sort_by: 'popularity.desc',
    };
    const pages = await Promise.all([1, 2, 3].map(page =>
      fetchTMDB('/discover/movie', { ...params, with_release_type: '2|3|4', page })));
    return flatResults(pages).map(m => ({ ...m, media_type: 'movie' }));
  },

  // TV premiering in the next `days`.
  getUpcomingTV: async (days = 180) => {
    const params = {
      'first_air_date.gte': dateStr(0),
      'first_air_date.lte': dateStr(days),
      sort_by: 'popularity.desc',
    };
    const pages = await Promise.all([1, 2].map(page => fetchTMDB('/discover/tv', { ...params, page })));
    return flatResults(pages).map(m => ({ ...m, media_type: 'tv' }));
  },

  // Theatrical + digital + TV premieres inside a specific date window.
  getReleasesInWindow: async (fromDate, toDate) => {
    const movieParams = { 'release_date.gte': fromDate, 'release_date.lte': toDate, sort_by: 'popularity.desc' };
    const [theatrical, digital, tv] = await Promise.all([
      fetchTMDB('/discover/movie', { ...movieParams, with_release_type: '2|3' }),
      fetchTMDB('/discover/movie', { ...movieParams, with_release_type: '4' }),
      fetchTMDB('/discover/tv', { 'first_air_date.gte': fromDate, 'first_air_date.lte': toDate, sort_by: 'popularity.desc' }),
    ]);
    const theatricalIds = new Set((theatrical?.results || []).map(m => m.id));
    return {
      theatrical: (theatrical?.results || []).map(m => ({ ...m, media_type: 'movie', release_kind: 'cinema' })),
      digital: (digital?.results || [])
        .filter(m => !theatricalIds.has(m.id))
        .map(m => ({ ...m, media_type: 'movie', release_kind: 'streaming' })),
      tv: (tv?.results || []).map(s => ({ ...s, media_type: 'tv', release_kind: 'tv' })),
    };
  },

  // Region-aware release dates for a movie. Returns {theatrical, digital} date strings.
  getReleaseDates: async (movieId) => {
    const data = await fetchTMDB(`/movie/${movieId}/release_dates`);
    const entries = data?.results || [];
    const forRegion = (r) => entries.find(e => e.iso_3166_1 === r)?.release_dates || [];
    const dates = forRegion(REGION).length ? forRegion(REGION) : forRegion('US');
    const byType = (types) => dates.find(d => types.includes(d.type))?.release_date?.slice(0, 10) || null;
    return { theatrical: byType([2, 3]), digital: byType([4]) };
  },

  // Official YouTube trailers for a title, newest first.
  getTrailers: async (mediaType, id) => {
    const data = await fetchTMDB(`/${mediaType}/${id}/videos`);
    return (data?.results || [])
      .filter(v => v.site === 'YouTube' && v.type === 'Trailer' && v.official)
      .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  },

  getDetails: (mediaType, id) => fetchTMDB(`/${mediaType}/${id}`),

  // Everything TMDB knows about a title in one call — the raw material for a
  // blog post. Trimmed to a compact, paraphrasable research pack (no full
  // review text dumped wholesale: excerpts only, to be reworded, never quoted).
  getEnrichment: async (mediaType, id) => {
    const d = await fetchTMDB(`/${mediaType}/${id}`,
      { append_to_response: 'credits,keywords,reviews,similar,external_ids' });
    if (!d) return null;
    const crew = d.credits?.crew || [];
    const byJob = (jobs) => [...new Set(crew.filter(c => jobs.includes(c.job)).map(c => c.name))].slice(0, 3);
    const kw = d.keywords?.keywords || d.keywords?.results || [];
    return {
      tagline: d.tagline || null,
      overview: d.overview || null,
      genres: (d.genres || []).map(g => g.name),
      runtime: d.runtime || d.episode_run_time?.[0] || null,
      release_date: d.release_date || d.first_air_date || null,
      vote_average: d.vote_average || null,
      vote_count: d.vote_count || null,
      directors: byJob(['Director']),
      writers: byJob(['Writer', 'Screenplay', 'Story']),
      creators: (d.created_by || []).map(c => c.name),
      cast: (d.credits?.cast || []).slice(0, 8).map(c => ({ name: c.name, as: c.character || null })),
      keywords: kw.slice(0, 12).map(k => k.name),
      similar: (d.similar?.results || []).slice(0, 6).map(s => s.title || s.name).filter(Boolean),
      reviews: (d.reviews?.results || []).slice(0, 2).map(r => ({
        author: r.author,
        rating: r.author_details?.rating ?? null,
        excerpt: (r.content || '').replace(/\s+/g, ' ').trim().slice(0, 240),
        url: r.url || null,
      })),
      imdb_id: d.external_ids?.imdb_id || null,
      wikidata_id: d.external_ids?.wikidata_id || null,
      homepage: d.homepage || null,
    };
  },

  getWatchProviders: async (mediaType, id) => {
    const data = await fetchTMDB(`/${mediaType}/${id}/watch/providers`);
    const regionData = data?.results?.[REGION] || data?.results?.US;
    return regionData?.flatrate || [];
  },

  // Films released exactly `years` ago today, by vote count.
  getAnniversaries: async (years, minVotes = 2000) => {
    const target = new Date();
    target.setUTCFullYear(target.getUTCFullYear() - years);
    const day = target.toISOString().slice(0, 10);
    const data = await fetchTMDB('/discover/movie', {
      'primary_release_date.gte': day,
      'primary_release_date.lte': day,
      'vote_count.gte': String(minVotes),
      sort_by: 'vote_count.desc',
    });
    return (data?.results || []).map(m => ({ ...m, media_type: 'movie', anniversary_years: years }));
  },
};

export const tmdbRegion = REGION;
export { dateStr };
