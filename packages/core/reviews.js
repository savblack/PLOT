import { getConfig } from './config.js';

/**
 * Fetch a title's critic score (Rotten Tomatoes %, via OMDb) by IMDb id.
 * Returns null when the resolver isn't configured, there's no IMDb id, or the
 * lookup fails/has no score — callers hide the critic pill in that case rather
 * than fabricating a number.
 *
 * @param {string|null|undefined} imdbId
 * @returns {Promise<{criticScore: number, source: string}|null>}
 */
export async function fetchCriticScore(imdbId) {
  const { criticScoreUrl, supabaseAnonKey } = getConfig();
  if (!criticScoreUrl || !imdbId) return null;
  try {
    const url = new URL(criticScoreUrl);
    url.searchParams.set('imdb_id', imdbId);
    const response = await fetch(url, {
      headers: supabaseAnonKey ? { Authorization: `Bearer ${supabaseAnonKey}`, apikey: supabaseAnonKey } : {},
    });
    if (!response.ok) return null;
    const data = await response.json();
    return Number.isFinite(data?.criticScore) ? { criticScore: data.criticScore, source: data.source } : null;
  } catch {
    return null;
  }
}

const MIN_QUOTE_LENGTH = 40;
const MAX_QUOTE_LENGTH = 220;

/**
 * Pick one displayable audience quote from a TMDB `/reviews` response. Prefers
 * a review with real substance (not a one-liner) and short enough to read as
 * a pull-quote, trimmed to a clean sentence boundary where possible.
 *
 * @param {{results?: Array<{content?: string, author?: string}>}|null|undefined} reviewsResponse
 * @returns {{text: string, author: string}|null}
 */
export function pickAudienceQuote(reviewsResponse) {
  const candidates = (reviewsResponse?.results || [])
    .map(r => ({ text: (r.content || '').trim().replace(/\s+/g, ' '), author: r.author }))
    .filter(r => r.text.length >= MIN_QUOTE_LENGTH);
  if (!candidates.length) return null;

  const pick = candidates.sort((a, b) => a.text.length - b.text.length)[0];
  if (pick.text.length <= MAX_QUOTE_LENGTH) return pick;

  const trimmed = pick.text.slice(0, MAX_QUOTE_LENGTH);
  const lastSentence = Math.max(trimmed.lastIndexOf('. '), trimmed.lastIndexOf('! '), trimmed.lastIndexOf('? '));
  const text = lastSentence > MIN_QUOTE_LENGTH ? trimmed.slice(0, lastSentence + 1) : `${trimmed.trimEnd()}…`;
  return { text, author: pick.author };
}

const HIGH = 85;
const GOOD = 65;
const MID = 50;
const LOW = 30;
const GAP_THRESHOLD = 15;

/**
 * Consensus line for a critic/audience score pair, per the copy bank agreed
 * with Savannah. Gap-based lines take priority over level-based ones — a wide
 * split is more informative than either score's absolute level.
 *
 * @param {number|null|undefined} criticScore
 * @param {number|null|undefined} audienceScore
 * @returns {string|null}
 */
export function getConsensusLine(criticScore, audienceScore) {
  if (!Number.isFinite(criticScore) || !Number.isFinite(audienceScore)) return null;

  const gap = criticScore - audienceScore;
  if (gap >= GAP_THRESHOLD) return 'Loved by critics, more divisive with viewers.';
  if (-gap >= GAP_THRESHOLD) return "The people have spoken: it's a resounding yes.";

  const lower = Math.min(criticScore, audienceScore);
  if (lower >= HIGH) return 'The reviews are unanimous. A must-watch.';
  if (lower >= GOOD) return 'Consistently praised by both camps.';
  if (lower >= MID) return 'A fine watch per both critics and audiences.';
  if (lower >= LOW) return 'Both critics and audiences left underwhelmed.';
  return 'Panned across the board.';
}
