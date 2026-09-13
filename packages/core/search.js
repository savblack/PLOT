/**
 * Search query understanding + result ranking, shared by web and mobile.
 *
 * TMDB's /search endpoints match the query string literally, so the way people
 * actually type ("7 up tv series", "dune movie", "the bear 2022") returns zero
 * or nonsense results: every extra word has to appear in the title. We parse
 * that intent out of the query first, point the request at the type-specific
 * endpoint when the user told us the type, and re-rank what comes back so an
 * exact title match beats a popular near-miss.
 */

/** Qualifiers that name a media type. Longest first — 'tv series' before 'tv'. */
const TYPE_QUALIFIERS = [
  ['television series', 'tv'],
  ['television show', 'tv'],
  ['limited series', 'tv'],
  ['tv programme', 'tv'],
  ['tv program', 'tv'],
  ['tv series', 'tv'],
  ['tv shows', 'tv'],
  ['tv show', 'tv'],
  ['miniseries', 'tv'],
  ['mini series', 'tv'],
  ['the series', 'tv'],
  ['series', 'tv'],
  ['show', 'tv'],
  ['tv', 'tv'],
  ['feature film', 'movie'],
  ['the movie', 'movie'],
  ['the film', 'movie'],
  ['movies', 'movie'],
  ['movie', 'movie'],
  ['films', 'movie'],
  ['film', 'movie'],
];

/**
 * Only unambiguous multi-word phrases may be stripped from the *front* of a
 * query. A leading bare 'show'/'film'/'the movie' is far more likely to be the
 * title itself ("The Movie Critic", "Show Me a Hero") than an intent.
 */
const LEADING_QUALIFIERS = new Set([
  'television series', 'television show', 'limited series',
  'tv programme', 'tv program', 'tv series', 'tv shows', 'tv show',
]);

/** Stripping down to one of these means the qualifier was the title. */
const BARE_REMAINDERS = new Set(['the', 'a', 'an']);

const EARLIEST_RELEASE_YEAR = 1870;

/**
 * Fold a title down to comparable text: case, accents, punctuation and
 * ampersands all stop mattering, so "WALL·E" matches "wall e" and
 * "Law & Order" matches "law and order".
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeTitle(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const stripTrailingSeason = (text) => text.replace(/\s+seasons?\s+\d{1,3}$/i, '');

/**
 * Pull search intent out of a raw query: the title to actually send to TMDB,
 * plus the media type and year the user mentioned around it.
 *
 * Stripping is deliberately conservative — qualifiers only count at the edges
 * of the query, and a query that is nothing *but* qualifiers is left alone
 * (someone searching "The Movie" means it). Callers should still treat the
 * media type as a hint: see `hasStrongTitleMatch` for the raw-query fallback.
 *
 * @param {string} [raw]
 * @returns {{ title: string, mediaType: 'movie'|'tv'|null, year: number|null, rawQuery: string }}
 */
export function parseSearchQuery(raw = '') {
  const rawQuery = String(raw ?? '').trim().replace(/\s+/g, ' ');
  let text = rawQuery;
  let mediaType = null;
  let year = null;

  // Year first: "(1998)" anywhere, or a bare trailing year. A leading year is
  // left alone — "2012" and "1917" are titles.
  const maxYear = new Date().getFullYear() + 5;
  const inYearRange = (value) => value >= EARLIEST_RELEASE_YEAR && value <= maxYear;

  const parenYear = text.match(/\((\d{4})\)/);
  if (parenYear && inYearRange(Number(parenYear[1]))) {
    year = Number(parenYear[1]);
    text = text.replace(parenYear[0], ' ').replace(/\s+/g, ' ').trim();
  } else {
    const trailingYear = text.match(/\s(\d{4})$/);
    if (trailingYear && inYearRange(Number(trailingYear[1]))) {
      year = Number(trailingYear[1]);
      text = text.slice(0, trailingYear.index).trim();
    }
  }

  // Qualifiers can stack ("the office tv series season 2"), and the order they
  // stack in varies, so keep peeling until a pass changes nothing.
  for (let pass = 0; pass < 3; pass++) {
    const before = text;

    const withoutSeason = stripTrailingSeason(text);
    if (withoutSeason !== text && withoutSeason.trim()) {
      text = withoutSeason.trim();
      mediaType = mediaType || 'tv';
    }

    const lower = text.toLowerCase();
    for (const [phrase, type] of TYPE_QUALIFIERS) {
      const trailing = lower.endsWith(` ${phrase}`);
      const leading = LEADING_QUALIFIERS.has(phrase) && lower.startsWith(`${phrase} `);
      if (!trailing && !leading) continue;

      const stripped = (trailing
        ? text.slice(0, text.length - phrase.length - 1)
        : text.slice(phrase.length + 1)).trim();
      // The qualifier *is* the query ("The Movie") — leave it alone rather
      // than searching for a bare article.
      if (!stripped || BARE_REMAINDERS.has(stripped.toLowerCase())) continue;

      text = stripped;
      mediaType = mediaType || type;
      break;
    }

    if (text === before) break;
  }

  return { title: text || rawQuery, mediaType, year, rawQuery };
}

/**
 * How well a candidate title answers the query, on a coarse ladder: exact
 * match, starts-with, contains-as-whole-words, contains, no relation.
 *
 * Intentionally coarse. Finer-grained scoring (shared-token counts and the
 * like) rewards titles that happen to reuse common words — "Wake Up 7" over
 * "The Up Series" for "7 up" — when TMDB's own relevance and popularity are
 * the better signal for a weak textual match.
 *
 * @param {string} candidate Normalized candidate title.
 * @param {string} query Normalized query title.
 * @returns {number} 0–100.
 */
export function titleMatchScore(candidate, query) {
  if (!candidate || !query) return 0;
  if (candidate === query) return 100;
  if (candidate.startsWith(`${query} `)) return 70;
  if (candidate.includes(` ${query} `) || candidate.endsWith(` ${query}`)) return 45;
  if (candidate.includes(query)) return 25;
  return 0;
}

/** The score at which we consider the query genuinely answered (exact or prefix). */
const STRONG_MATCH_SCORE = 70;

const candidateTitles = (result) => [
  result?.title, result?.name, result?.original_title, result?.original_name,
];

const candidateYear = (result) => {
  const date = result?.release_date || result?.first_air_date || '';
  const value = Number(String(date).slice(0, 4));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const bestTitleScore = (result, queries) => {
  let best = 0;
  for (const title of candidateTitles(result)) {
    const normalized = normalizeTitle(title);
    if (!normalized) continue;
    for (const query of queries) best = Math.max(best, titleMatchScore(normalized, query));
  }
  return best;
};

const queryVariants = (intent) => {
  const variants = [normalizeTitle(intent?.title), normalizeTitle(intent?.rawQuery)];
  return [...new Set(variants.filter(Boolean))];
};

/**
 * Score one result against the parsed intent. Title match dominates; media type
 * and year adjust within it, so a title the user clearly typed still wins even
 * when it contradicts the type they asked for.
 *
 * @param {Record<string, any>} result
 * @param {{ title?: string, rawQuery?: string, mediaType?: 'movie'|'tv'|null, year?: number|null }} intent
 * @returns {number}
 */
export function scoreSearchResult(result, intent = {}) {
  let score = bestTitleScore(result, queryVariants(intent));

  if (intent.mediaType && result?.media_type) {
    score += result.media_type === intent.mediaType ? 30 : -15;
  }

  if (intent.year) {
    const year = candidateYear(result);
    if (year) score += year === intent.year ? 25 : -5;
  }

  return score;
}

/**
 * Does anything here actually look like what was typed? Used to decide whether
 * a stripped qualifier was really part of the title ("The Truman Show") and the
 * raw query deserves a second look.
 *
 * @param {Record<string, any>[]} results
 * @param {string} title
 * @returns {boolean}
 */
export function hasStrongTitleMatch(results = [], title = '') {
  const query = normalizeTitle(title);
  if (!query) return false;
  return (Array.isArray(results) ? results : [])
    .some(result => bestTitleScore(result, [query]) >= STRONG_MATCH_SCORE);
}

/**
 * Re-rank TMDB results against the parsed intent, using popularity only to
 * break ties. TMDB orders by popularity alone, which buries the exact title
 * someone typed under whatever is trending.
 *
 * @param {Record<string, any>[]} results
 * @param {{ title?: string, rawQuery?: string, mediaType?: 'movie'|'tv'|null, year?: number|null }} [intent]
 * @returns {Record<string, any>[]} A new, sorted array.
 */
export function rankSearchResults(results = [], intent = {}) {
  return (Array.isArray(results) ? results : [])
    .map((result, index) => ({ result, index, score: scoreSearchResult(result, intent) }))
    .sort((a, b) =>
      b.score - a.score ||
      (b.result?.popularity ?? 0) - (a.result?.popularity ?? 0) ||
      a.index - b.index)
    .map(entry => entry.result);
}

export function classifySearchResults(rawResults = []) {
  const results = Array.isArray(rawResults) ? rawResults : [];
  const filtered = results
    .filter(r => r.media_type === 'movie' || r.media_type === 'tv')
    .filter(r => r.poster_path || r.name || r.title);

  if (filtered.length > 0) {
    return { filtered, emptyMode: 'none' };
  }

  if (results.some(r => r.media_type === 'person')) {
    return { filtered, emptyMode: 'title-guidance' };
  }

  return { filtered, emptyMode: 'generic' };
}

export const MIN_RATED_VOTES = 50;

/**
 * The facts that tell one "Dune" from another without opening the panel:
 * year, genres, an audience score, and the original title when it differs.
 * All of it is already on the TMDB search payload — nothing here
 * costs a request. Genres come as ids on search results, so callers pass the
 * genre list they already hold (see useGenres).
 *
 * The score is suppressed below MIN_RATED_VOTES: a 9.5 from six votes says
 * nothing, and showing it would rank an obscure short above the film the
 * user meant.
 *
 * @param {any} item
 * @param {Array<{id:number,name:string}>} [genres]
 * @returns {{ year: string, genres: string[], rating: string|null, originalTitle: string|null }}
 */
export function describeSearchResult(item, genres = []) {
  const year = String(item?.release_date || item?.first_air_date || '').slice(0, 4);

  const byId = new Map((genres || []).map(g => [g.id, g.name]));
  const ids = Array.isArray(item?.genre_ids) ? item.genre_ids : [];
  const genreNames = ids.map(id => byId.get(id)).filter(Boolean).slice(0, 2);

  const votes = Number(item?.vote_count) || 0;
  const score = Number(item?.vote_average);
  const rating = votes >= MIN_RATED_VOTES && Number.isFinite(score) && score > 0
    ? score.toFixed(1)
    : null;

  const title = item?.title || item?.name || '';
  const original = item?.original_title || item?.original_name || '';
  const originalTitle = original && normalizeTitle(original) !== normalizeTitle(title) ? original : null;

  return { year, genres: genreNames, rating, originalTitle };
}
