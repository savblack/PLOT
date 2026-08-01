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

const GAP_THRESHOLD = 15;

// TMDB vote_count below this reads as "early days" rather than a settled
// verdict. There's no equivalent signal for the critic side — OMDb no longer
// returns a Rotten Tomatoes review count (`tomatoReviews` is permanently
// "N/A" as of this writing) — so confidence-aware copy only applies to the
// audience score.
const LOW_AUDIENCE_VOTES = 200;

// Ordered highest floor first; `min` is the floor of Math.min(critic, audience).
const LEVEL_BANDS = [
  { min: 90, lines: [
    'The reviews are unanimous. A must-watch.',
    'About as acclaimed as it gets.',
    'Consensus pick: essential viewing.',
  ] },
  { min: 80, lines: [
    'Consistently praised by both camps.',
    'Excellent reviews across the board.',
    'A genuine favorite with both critics and audiences.',
  ] },
  { min: 65, lines: [
    'Well liked across the board.',
    'Strong reviews from critics and audiences alike.',
    'A dependable one, liked by both sides.',
  ] },
  { min: 50, lines: [
    'A fine watch per both critics and audiences.',
    'Decent, not a standout, per critics and audiences.',
    'Middle of the road for both critics and viewers.',
  ] },
  { min: 35, lines: [
    'Both critics and audiences left underwhelmed.',
    "Didn't quite land with critics or audiences.",
    'Fell short for both critics and viewers.',
  ] },
  { min: 20, lines: [
    'Weak reviews all around.',
    'Not landing with critics or audiences.',
    'A rough one for both critics and viewers.',
  ] },
  { min: 0, lines: [
    'Panned across the board.',
    'One of the worst reviewed titles this year, by both counts.',
    'Rock bottom for critics and audiences alike.',
  ] },
];

const CRITIC_HEAVY_LINES = [
  'Loved by critics, more divisive with viewers.',
  "A critics' favorite. Audiences were cooler on it.",
  'Higher marks from critics than from viewers.',
];

const AUDIENCE_HEAVY_LINES = [
  "The people have spoken: it's a resounding yes.",
  'A bigger hit with viewers than with critics.',
  'Audiences are more enthusiastic than critics here.',
];

const AUDIENCE_HEAVY_LOW_VOLUME_LINES = [
  'Early audience reaction is strongly positive, still catching on with critics.',
  "So far, viewers are loving it more than critics are.",
  'Early word from viewers is glowing.',
];

// Simple deterministic hash so the same title always shows the same line
// (rather than reshuffling on every render) while different titles in the
// same bucket read as distinct copy, not a repeated stock phrase.
function pick(lines, seed) {
  if (!Number.isFinite(seed)) return lines[0];
  const index = Math.abs(Math.round(seed)) % lines.length;
  return lines[index];
}

/**
 * Consensus line for a critic/audience score pair. Gap-based lines take
 * priority over level-based ones — a wide split is more informative than
 * either score's absolute level. `seed` (e.g. the title's TMDB id) picks a
 * stable variant per title so repeat viewing doesn't feel copy-pasted.
 *
 * @param {number|null|undefined} criticScore
 * @param {number|null|undefined} audienceScore
 * @param {{audienceVoteCount?: number, seed?: number}} [opts]
 * @returns {string|null}
 */
export function getConsensusLine(criticScore, audienceScore, { audienceVoteCount, seed } = {}) {
  if (!Number.isFinite(criticScore) || !Number.isFinite(audienceScore)) return null;

  const gap = criticScore - audienceScore;
  if (gap >= GAP_THRESHOLD) return pick(CRITIC_HEAVY_LINES, seed);
  if (-gap >= GAP_THRESHOLD) {
    const lowVolume = Number.isFinite(audienceVoteCount) && audienceVoteCount < LOW_AUDIENCE_VOTES;
    return pick(lowVolume ? AUDIENCE_HEAVY_LOW_VOLUME_LINES : AUDIENCE_HEAVY_LINES, seed);
  }

  const lower = Math.min(criticScore, audienceScore);
  const band = LEVEL_BANDS.find(b => lower >= b.min);
  return pick(band.lines, seed);
}
