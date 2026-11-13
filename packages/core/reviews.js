import { getConfig } from './config.js';
import { FAILED_LOADS, reportLoadFailure } from './actionFailures.js';

/**
 * @typedef {Object} CriticScoreResult
 * @property {number|null} criticScore Rotten Tomatoes %, or null when OMDb has none
 * @property {string|null} source e.g. 'Rotten Tomatoes'; null with no score
 * @property {string|null} awards OMDb's Awards text, e.g. 'Won 4 Oscars. 159 wins & 220 nominations total'
 */

/**
 * Fetch a title's critic score (Rotten Tomatoes %, via OMDb) and OMDb's awards
 * text by IMDb id. Returns null when the resolver isn't configured, there's no
 * IMDb id, the lookup fails, or it has neither a score nor awards. Either field
 * can be null on its own (an awarded film with no RT score, say), so callers
 * check each one and hide that row rather than fabricating a value.
 *
 * @param {string|null|undefined} imdbId
 * @returns {Promise<CriticScoreResult|null>}
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
    if (!response.ok) {
      reportLoadFailure(FAILED_LOADS.CRITIC_SCORE, { status: response.status });
      return null;
    }
    const data = await response.json();
    const criticScore = Number.isFinite(data?.criticScore) ? data.criticScore : null;
    const awards = typeof data?.awards === 'string' && data.awards.trim() ? data.awards.trim() : null;
    if (criticScore == null && !awards) return null;
    return { criticScore, source: criticScore == null ? null : data.source ?? null, awards };
  } catch (error) {
    reportLoadFailure(FAILED_LOADS.CRITIC_SCORE, error);
    return null;
  }
}

/**
 * Whether OMDb's awards text records at least one win, as opposed to
 * nominations only. "Won 4 Oscars. 309 wins & 261 nominations total" and
 * "1 win & 3 nominations" are wins; "Nominated for 1 Oscar. 2 nominations
 * total" is not.
 *
 * @param {string|null|undefined} awards
 * @returns {boolean}
 */
export function awardsIncludeWin(awards) {
  if (typeof awards !== 'string') return false;
  return /\bwon\b/i.test(awards) || /\b[1-9]\d*\s+wins?\b/i.test(awards);
}

/**
 * Report that a title panel is showing the awards row. Call it with the
 * fetchCriticScore result once per panel open; it does nothing when there are
 * no awards, so callers need not check. Best-effort: analytics never throws.
 *
 * @param {CriticScoreResult|null|undefined} result
 * @param {{ tmdbId?: number|null, mediaType?: string|null }} title
 */
export function reportAwardsShown(result, { tmdbId = null, mediaType = null } = {}) {
  if (!result?.awards) return;
  try {
    getConfig().onAwardsShown?.({
      tmdb_id: Number.isFinite(Number(tmdbId)) ? Number(tmdbId) : null,
      media_type: mediaType ?? null,
      won: awardsIncludeWin(result.awards),
      has_critic_score: Number.isFinite(result.criticScore),
    });
  } catch { /* analytics is best-effort */ }
}

const MIN_QUOTE_LENGTH = 40;
const MAX_QUOTE_LENGTH = 220;

// The pull-quote sits on the title page as if Plot chose it, so it must be a
// review its own author scored well. TMDB's author_details.rating is out of 10;
// unrated reviews are skipped because their tone is unknown. On 2026-11-13 the
// shortest Rings of Power review was an unrated "Woke and horrible..." rant,
// which the old shortest-wins rule put on the page for everyone.
const MIN_QUOTE_RATING = 7;

// Backstop for a well-rated review that still carries culture-war or abusive
// language. Matched on word boundaries, case-insensitively.
const BLOCKED_QUOTE_WORDS = /\b(woke|dei|agenda|propaganda|diversity hire|forced diversity|race[- ]?swap(ped)?|pandering|sjw|snowflakes?|libtards?|retard(ed)?|f+u+c+k\w*|shit\w*|crap|trash|garbage|dreck|abomination)\b/i;

/**
 * Pick one displayable audience quote from a TMDB `/reviews` response. Only
 * reviews the author rated MIN_QUOTE_RATING/10 or higher, with no blocked
 * language, qualify. Among those it prefers a review with real substance (not
 * a one-liner) and short enough to read as a pull-quote, trimmed to a clean
 * sentence boundary where possible.
 *
 * @param {{results?: Array<{content?: string, author?: string, author_details?: {rating?: number|null}}>}|null|undefined} reviewsResponse
 * @returns {{text: string, author: string}|null}
 */
export function pickAudienceQuote(reviewsResponse) {
  const candidates = (reviewsResponse?.results || [])
    .filter(r => Number.isFinite(r?.author_details?.rating) && r.author_details.rating >= MIN_QUOTE_RATING)
    .map(r => ({ text: unwrapQuote((r.content || '').trim().replace(/\s+/g, ' ')), author: r.author }))
    .filter(r => r.text.length >= MIN_QUOTE_LENGTH && !BLOCKED_QUOTE_WORDS.test(r.text));
  if (!candidates.length) return null;

  const pick = candidates.sort((a, b) => a.text.length - b.text.length)[0];
  if (pick.text.length <= MAX_QUOTE_LENGTH) return pick;

  const trimmed = pick.text.slice(0, MAX_QUOTE_LENGTH);
  const lastSentence = Math.max(trimmed.lastIndexOf('. '), trimmed.lastIndexOf('! '), trimmed.lastIndexOf('? '));
  const text = lastSentence > MIN_QUOTE_LENGTH ? trimmed.slice(0, lastSentence + 1) : `${trimmed.trimEnd()}…`;
  return { text: unwrapQuote(text), author: pick.author };
}

// Both apps wrap the quote in their own marks, so drop the review's: a leading
// mark, and a closing one that sits before final punctuation or the cut.
function unwrapQuote(text) {
  return text.replace(/^["“]+/, '').replace(/["”]+([.!?…]?)$/, '$1').trim();
}

const GAP_MILD = 15;
const GAP_STRONG = 25;

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
    'About as poorly reviewed as a title gets.',
    'Rock bottom for critics and audiences alike.',
  ] },
];

// A 15-24 point gap is a mild lean, not a split — "divisive" language doesn't
// fit an 80/70. That framing is reserved for GAP_STRONG (25+).
const CRITIC_MILD_LINES = [
  'Critics rated it a bit higher than audiences did.',
  'Slightly more love from critics than from viewers.',
  'Critics were a touch more enthusiastic here.',
];

const CRITIC_STRONG_LINES = [
  'Adored by critics. Audiences, less so.',
  "A critics' favorite. Audiences were considerably cooler on it.",
  'Critics were far more enthusiastic than audiences here.',
];

const AUDIENCE_MILD_LINES = [
  'Audiences rated it a bit higher than critics did.',
  'Slightly more love from viewers than from critics.',
  'A touch more popular with audiences than critics.',
];

const AUDIENCE_STRONG_LINES = [
  "The people have spoken: it's a resounding yes.",
  'A bigger hit with viewers than with critics.',
  'Audiences are far more enthusiastic than critics here.',
];

const AUDIENCE_STRONG_LOW_VOLUME_LINES = [
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

// Every score-based branch below (gap math, LEVEL_BANDS) assumes a 0-100
// scale. 0 and 100 are legitimate scores, not error cases — LEVEL_BANDS has
// an explicit `min: 0` band — so the bounds are inclusive.
function isValidScore(score) {
  return Number.isFinite(score) && score >= 0 && score <= 100;
}

/**
 * Consensus line for a critic/audience score pair. Gap-based lines take
 * priority over level-based ones — a wide split is more informative than
 * either score's absolute level. `seed` (e.g. the title's TMDB id) picks a
 * stable variant per title so repeat viewing doesn't feel copy-pasted.
 *
 * Returns null when either score isn't a finite number in the 0-100 range,
 * so callers can hide the consensus UI rather than show garbage (or crash).
 *
 * @param {number|null|undefined} criticScore 0-100
 * @param {number|null|undefined} audienceScore 0-100
 * @param {{audienceVoteCount?: number, seed?: number}} [opts]
 * @returns {string|null}
 */
export function getConsensusLine(criticScore, audienceScore, { audienceVoteCount, seed } = {}) {
  if (!isValidScore(criticScore) || !isValidScore(audienceScore)) return null;

  const gap = criticScore - audienceScore;
  if (gap >= GAP_STRONG) return pick(CRITIC_STRONG_LINES, seed);
  if (gap >= GAP_MILD) return pick(CRITIC_MILD_LINES, seed);
  if (-gap >= GAP_STRONG) {
    const lowVolume = Number.isFinite(audienceVoteCount) && audienceVoteCount < LOW_AUDIENCE_VOTES;
    return pick(lowVolume ? AUDIENCE_STRONG_LOW_VOLUME_LINES : AUDIENCE_STRONG_LINES, seed);
  }
  if (-gap >= GAP_MILD) return pick(AUDIENCE_MILD_LINES, seed);

  const lower = Math.min(criticScore, audienceScore);
  const band = LEVEL_BANDS.find(b => lower >= b.min);
  return pick(band.lines, seed);
}

/**
 * TMDB's audience score as a percentage, or null when there is nothing to show.
 * A title nobody has voted on reports vote_average 0, and "0% Audience" reads
 * as a verdict rather than an absence — so anything that rounds below 1% is
 * treated as no score.
 *
 * @param {{vote_average?: number, vote_count?: number}|null|undefined} details
 * @returns {number|null}
 */
export function audienceScoreFromDetails(details) {
  const average = details?.vote_average;
  if (!Number.isFinite(average)) return null;
  if (Number.isFinite(details?.vote_count) && details.vote_count <= 0) return null;
  const score = Math.round(average * 10);
  return score >= 1 ? score : null;
}
