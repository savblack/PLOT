import { localDateStr, dateToLocalStr } from './date.js';
import { getConfig } from './config.js';

let userRegion = 'US';
export const setTmdbRegion = (region) => { userRegion = region; };
export const getTmdbRegion = () => userRegion;

const ENGLISH_SPEAKING_REGIONS = new Set(['AU', 'CA', 'GB', 'IE', 'NZ', 'US']);

/**
 * Gently bias a ranked TMDB result set toward titles made in English-speaking
 * markets, without filtering out international titles or losing TMDB's order
 * within either group. Two preferred titles are surfaced for every one other
 * title while both groups have results.
 *
 * TMDB list responses expose original_language for all media, and origin_country
 * for TV. Movies do not include production countries in these lightweight
 * responses, so original language is the reliable shared signal.
 *
 * @param {Array<{original_language?: string, origin_country?: string[]}>} items
 * @returns {Array<any>}
 */
export function prioritiseEnglishSpeakingTitles(items = []) {
  const preferred = [];
  const other = [];

  for (const item of items) {
    const isEnglishLanguage = item?.original_language === 'en';
    const isFromEnglishSpeakingMarket = item?.origin_country?.some(country => ENGLISH_SPEAKING_REGIONS.has(country));
    (isEnglishLanguage || isFromEnglishSpeakingMarket ? preferred : other).push(item);
  }

  const ranked = [];
  while (preferred.length || other.length) {
    ranked.push(...preferred.splice(0, 2));
    if (other.length) ranked.push(other.shift());
  }
  return ranked;
}

const REGIONAL_RELEASE_TYPE_ORDER = [3, 2, 4, 1, 5, 6];

/**
 * Returns the most relevant recorded release date for the active region.
 * TMDB's top-level movie release_date is the primary date, which can be from
 * another country even when a user has chosen a different region.
 *
 * @param {{results?: Array<{iso_3166_1?: string, release_dates?: Array<{type?: number, release_date?: string}>}>}|undefined|null} releaseDates
 * @param {string} [region]
 * @returns {string|null}
 */
export function regionalMovieReleaseDate(releaseDates, region = userRegion) {
  const dates = releaseDates?.results
    ?.find(entry => entry.iso_3166_1 === region)
    ?.release_dates
    ?.filter(entry => entry.release_date) || [];

  for (const type of REGIONAL_RELEASE_TYPE_ORDER) {
    const match = dates.find(entry => entry.type === type);
    if (match) return match.release_date.slice(0, 10);
  }
  return dates[0]?.release_date?.slice(0, 10) || null;
}

const withRegionalMovieReleaseDate = (movie) => {
  const releaseDate = regionalMovieReleaseDate(movie?.release_dates);
  return releaseDate ? { ...movie, release_date: releaseDate } : movie;
};

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const RETRY_DELAYS   = [400, 1200]; // ms — 2 retries with backoff

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

/**
 * Low-level proxy fetch that surfaces *why* it failed instead of collapsing
 * everything to null. Callers that need to tell "rate-limited / transient"
 * apart from "this id doesn't exist" use this; the convenience wrappers below
 * keep the historic null-on-anything behaviour.
 *
 * @param {string} endpoint
 * @param {object} [params]
 * @param {object} [opts]
 * @param {number[]} [opts.retryDelays]  Backoff schedule in ms (length = retry count).
 * @returns {Promise<{ ok: boolean, data: any, status: number|null, retryable: boolean }>}
 *   ok=true → data is the parsed JSON.
 *   ok=false + retryable=true  → transient (429 / 5xx / network) after exhausting retries.
 *   ok=false + retryable=false → terminal (e.g. 404 not found, bad id, misconfig).
 */
const fetchFromTMDBResolved = async (endpoint, params = {}, { retryDelays = RETRY_DELAYS } = {}) => {
  const { tmdbProxyUrl: PROXY_URL, supabaseAnonKey: SUPABASE_ANON_KEY } = getConfig();
  const queryParams = new URLSearchParams({
    path: endpoint.replace(/^\//, ''),
    language: 'en-US',
    region: userRegion,
    ...params,
  });

  if (!PROXY_URL) {
    console.error('TMDB Fetch Error: tmdbProxyUrl is not configured');
    return { ok: false, data: null, status: null, retryable: false };
  }

  const url = `${PROXY_URL}?${queryParams}`;
  const headers = {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'apikey': SUPABASE_ANON_KEY,
  };

  for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        const retryable = RETRY_STATUSES.has(response.status);
        if (retryable && attempt < retryDelays.length) {
          await sleep(retryDelays[attempt]);
          continue;
        }
        console.error(`TMDB Proxy Error: ${response.status} ${endpoint}`);
        return { ok: false, data: null, status: response.status, retryable };
      }
      return { ok: true, data: await response.json(), status: response.status, retryable: false };
    } catch (error) {
      // Network/abort errors are transient — retry, then report as retryable.
      if (attempt < retryDelays.length) {
        await sleep(retryDelays[attempt]);
        continue;
      }
      console.error('TMDB Fetch Error:', error);
      return { ok: false, data: null, status: null, retryable: true };
    }
  }
  return { ok: false, data: null, status: null, retryable: true };
};

const fetchFromTMDB = async (endpoint, params = {}) => {
  const { data } = await fetchFromTMDBResolved(endpoint, params);
  return data;
};

// Exported so other proxy reads can opt into retryable/terminal disambiguation.
export { fetchFromTMDBResolved };

export const tmdb = {
  /* ── Search ── */
  search: (query) => fetchFromTMDB('/search/multi', { query }),
  searchPeople: (query) => fetchFromTMDB('/search/person', { query }),
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
  getMovieDetails: async (id) => {
    const movie = await fetchFromTMDB(`/movie/${id}`, { append_to_response: 'watch/providers,recommendations,videos,credits,release_dates' });
    return withRegionalMovieReleaseDate(movie);
  },
  getTVDetails: (id) =>
    fetchFromTMDB(`/tv/${id}`, { append_to_response: 'watch/providers,recommendations,videos,aggregate_credits' }),

  /**
   * Resolve a movie/TV detail record, surfacing transient vs. terminal failure
   * so callers (e.g. the /save deep-link processor) can retry on a rate-limit
   * burst instead of hard-failing on the very first 429.
   *
   * @param {'movie'|'tv'} mediaType
   * @param {number|string} id
   * @returns {Promise<{ ok: boolean, data: any, status: number|null, retryable: boolean }>}
   */
  getDetails: async (mediaType, id) => {
    const path = mediaType === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const result = await fetchFromTMDBResolved(path, {
      append_to_response: mediaType === 'tv'
        ? 'watch/providers,recommendations,videos,aggregate_credits'
        : 'watch/providers,recommendations,videos,credits,release_dates',
    });
    return result.ok && mediaType !== 'tv'
      ? { ...result, data: withRegionalMovieReleaseDate(result.data) }
      : result;
  },

  /**
   * Lightweight title lookup — poster, name, dates — without the
   * recommendations/credits/videos payload getDetails carries. For hydrating
   * rails built from a bare list of {media_type, tmdb_id} (e.g. For You),
   * where only card-level fields are rendered.
   */
  getBasicDetails: async (mediaType, id) => {
    const path = mediaType === 'tv' ? `/tv/${id}` : `/movie/${id}`;
    const movie = await fetchFromTMDB(path);
    return mediaType === 'tv' ? movie : withRegionalMovieReleaseDate(movie);
  },

  /* ── Talent ── */
  getPersonDetails: (id) => fetchFromTMDB(`/person/${id}`),
  getPersonCredits: (id) => fetchFromTMDB(`/person/${id}/combined_credits`),

  /* ── Digital (streaming) release date for a movie, by region ── */
  getDigitalReleaseDate: async (movieId) => {
    const data = await fetchFromTMDB(`/movie/${movieId}/release_dates`);
    const entries = data?.results || [];
    const dates = entries.find(entry => entry.iso_3166_1 === userRegion)?.release_dates || [];
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
  getUpcoming: async (providerIds = [], monetizationTypes = 'flatrate') => {
    const today = localDateStr();
    const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6);
    const end = dateToLocalStr(sixMonths);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: monetizationTypes }
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

  /* ── "On this day" — a notable film released on today's calendar date in
     a past year. A spread of meaningful anniversary marks keeps this editorial
     rather than a random date lookup. ── */
  getOnThisDay: async ({
    years = [50, 40, 30, 25, 20, 15, 10],
    archiveYears = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
    minVotes = 1500,
    random = Math.random,
  } = {}) => {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const dayOfMonth = String(now.getDate()).padStart(2, '0');
    const batches = await Promise.all(
      years.map(async (yearsAgo) => {
        const date = `${now.getFullYear() - yearsAgo}-${month}-${dayOfMonth}`;
        const data = await fetchFromTMDB('/discover/movie', {
          'release_date.gte': date,
          'release_date.lte': date,
          with_release_type: '3|2',
          'vote_count.gte': String(minVotes),
          sort_by: 'vote_count.desc',
        });
        return (data?.results ?? []).map(movie => ({
          ...movie,
          media_type: 'movie',
          anniversary_years: yearsAgo,
        }));
      })
    );
    const anniversaryPick = batches.flat().sort((a, b) => (b.vote_count ?? 0) - (a.vote_count ?? 0))[0];
    if (anniversaryPick) return anniversaryPick;

    // Some calendar dates have no suitably notable release. Fall back to one
    // archival year and choose from its strongest results, so Discover still
    // has a serendipitous but credible film to surface.
    const archiveYearsAgo = archiveYears[Math.floor(random() * archiveYears.length)];
    if (!archiveYearsAgo) return null;
    const archiveYear = now.getFullYear() - archiveYearsAgo;
    const archive = await fetchFromTMDB('/discover/movie', {
      'release_date.gte': `${archiveYear}-01-01`,
      'release_date.lte': `${archiveYear}-12-31`,
      with_release_type: '3|2',
      'vote_count.gte': String(minVotes),
      sort_by: 'popularity.desc',
    });
    const candidates = archive?.results ?? [];
    if (!candidates.length) return null;
    const movie = candidates[Math.floor(random() * candidates.length)];
    return { ...movie, media_type: 'movie', archive_year: archiveYear };
  },

  /* ── Upcoming TV (optionally filtered to specific providers) ── */
  getUpcomingTV: async (providerIds = [], monetizationTypes = 'flatrate') => {
    const today = localDateStr();
    const sixMonths = new Date(); sixMonths.setMonth(sixMonths.getMonth() + 6);
    const end = dateToLocalStr(sixMonths);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: monetizationTypes }
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
  // TMDB's region provider list occasionally contains duplicate provider_ids
  // (e.g. Stan / Curiosity Stream have collided in some regions) — a
  // duplicate id breaks id-keyed selection state and list keys downstream,
  // so two entries would toggle together. Dedupe, keeping the first.
  getWatchProvidersForRegion: async (type, region) => {
    const data = await fetchFromTMDB(`/watch/providers/${type}`, { watch_region: region });
    if (!data?.results) return data;
    const seen = new Set();
    const results = data.results.filter(p => {
      if (seen.has(p.provider_id)) return false;
      seen.add(p.provider_id);
      return true;
    });
    return { ...data, results };
  },

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

  /* ── Discover by provider ──
     TV popularity is dominated by daily/long-running programming (news, talk,
     soaps, reality), so for TV we exclude those genres and raise the vote floor
     to keep each platform's list to actual notable shows. Movies don't need it. */
  discoverByProviders: (type, providerIds, region, extra = {}) =>
    fetchFromTMDB(`/discover/${type}`, {
      watch_region: region || userRegion,
      with_watch_providers: Array.isArray(providerIds) ? providerIds.join('|') : providerIds,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      'vote_count.gte': type === 'tv' ? 50 : 20,
      ...(type === 'tv' ? { without_genres: '10763,10767,10764,10766,10762' } : {}),
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
  getRecentReleases: async (days = 14, providerIds = [], monetizationTypes = 'flatrate') => {
    const endStr   = localDateStr();
    const startStr = localDateStr(-days);
    const providerParams = providerIds.length
      ? { watch_region: userRegion, with_watch_providers: providerIds.join('|'), with_watch_monetization_types: monetizationTypes }
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

  /* ── Newest released titles in a genre ── */
  discoverNewestByGenre: (type, genreId) => {
    if (!genreId) return Promise.resolve(null);
    const dateField = type === 'tv' ? 'first_air_date' : 'primary_release_date';
    return fetchFromTMDB(`/discover/${type}`, {
      with_genres: genreId,
      sort_by: `${dateField}.desc`,
      [`${dateField}.lte`]: localDateStr(),
      'vote_count.gte': 1,
    });
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
