import { MEDIA_PANEL } from './copy/mediaPanel.js';
import { supabase } from './supabase.js';
import { guideSeasons } from './watchingProgress.js';

const HOLD_AT = 7;
const PAGE = 1000;

/** Numbered seasons that can fill the grid. Specials stay in the episode guide. */
export function episodeRatingSeasonNumbers(details) {
  return guideSeasons(details)
    .filter(season => {
      const number = Number(season?.season_number);
      const count = season?.episode_count;
      return number > 0 && (count == null || count === '' || Number(count) > 0);
    })
    .map(season => Number(season.season_number));
}

/** A positive score, or null when TMDB is reporting "nobody has voted". */
export function scoredValue(average, voteCount) {
  const score = Number(average);
  if (!Number.isFinite(score) || score <= 0) return null;
  if (voteCount != null && Number(voteCount) <= 0) return null;
  return Math.round(score * 10) / 10;
}

export function ratingBand(score) {
  if (score == null || !Number.isFinite(Number(score))) return 'empty';
  const value = Number(score);
  if (value >= 9) return 'peak';
  if (value >= 8) return 'good';
  if (value >= 7) return 'fine';
  if (value >= 6) return 'soft';
  return 'fall';
}

export function formatEpisodeScore(score, source) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const value = Math.round(Number(score) * 10) / 10;
  if (source === 'tmdb') return value.toFixed(1);
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatVoteCount(count) {
  const value = Number(count);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value >= 1000000) {
    const millions = value / 1000000;
    const label = millions >= 10 ? String(Math.round(millions)) : String(Math.round(millions * 10) / 10);
    return `${label}m`;
  }
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

function episodeFromPayload(episode) {
  const episodeNumber = Number(episode?.episode_number);
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return null;
  const voteCount = Number(episode?.vote_count);
  return {
    episodeNumber,
    name: typeof episode?.name === 'string' ? episode.name : '',
    score: scoredValue(episode?.vote_average, episode?.vote_count),
    voteCount: Number.isFinite(voteCount) && voteCount > 0 ? voteCount : null,
  };
}

/** @param {Array<{ season_number?: number, episodes?: Array<object> }>} payloads */
export function gridFromSeasonPayloads(payloads) {
  const seasons = [];
  for (const payload of payloads || []) {
    const seasonNumber = Number(payload?.season_number);
    if (!Number.isInteger(seasonNumber) || seasonNumber < 1) continue;
    const seen = new Set();
    const episodes = [];
    for (const episode of payload?.episodes || []) {
      const cell = episodeFromPayload(episode);
      if (!cell || seen.has(cell.episodeNumber)) continue;
      seen.add(cell.episodeNumber);
      episodes.push(cell);
    }
    episodes.sort((a, b) => a.episodeNumber - b.episodeNumber);
    seasons.push({ seasonNumber, episodes });
  }
  seasons.sort((a, b) => a.seasonNumber - b.seasonNumber);
  return seasons;
}

export async function loadTmdbEpisodeGrid(tvId, seasonNumbers, getSeason) {
  const payloads = await Promise.all(seasonNumbers.map(async season => {
    const payload = await getSeason(tvId, season);
    if (!payload || !Array.isArray(payload.episodes)) return null;
    const seasonNumber = Number(payload.season_number);
    return {
      ...payload,
      season_number: Number.isInteger(seasonNumber) && seasonNumber >= 1 ? seasonNumber : season,
    };
  }));
  if (payloads.some(payload => !payload)) throw new Error('Could not load episode ratings');
  return gridFromSeasonPayloads(payloads);
}

function personalScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score) || score <= 0 || score > 10) return null;
  return Math.round(score * 10) / 10;
}

function scoreKey(season, episode) {
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);
  if (!Number.isInteger(seasonNumber) || seasonNumber < 1) return null;
  if (!Number.isInteger(episodeNumber) || episodeNumber < 1) return null;
  return `${seasonNumber}:${episodeNumber}`;
}

/**
 * Imported episode ratings, then watch-event scores underneath them.
 * A later annotation replaces an earlier one for the same episode.
 * @param {{ annotations?: object[], events?: object[] }} rows
 * @returns {Record<string, number>}
 */
export function personalScoresFromRows({ annotations = [], events = [] } = {}) {
  const scores = {};
  const watches = [...events].sort((a, b) => String(a?.created_at || '').localeCompare(String(b?.created_at || '')));
  for (const event of watches) {
    const key = scoreKey(event?.season_number, event?.episode_number);
    const score = personalScore(event?.source_rating);
    if (key && score != null) scores[key] = score;
  }
  const notes = [...annotations].sort((a, b) => String(a?.imported_at || '').localeCompare(String(b?.imported_at || '')));
  for (const row of notes) {
    if (row?.annotation?.kind !== 'rating') continue;
    const key = scoreKey(row?.season_number, row?.episode_number);
    const score = personalScore(row?.annotation?.rating);
    if (key && score != null) scores[key] = score;
  }
  return scores;
}

async function readPages(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function readPersonalEpisodeRatings(userId, tvId) {
  if (!userId || !tvId) return {};
  const [annotations, events] = await Promise.all([
    readPages(() => supabase.from('imported_annotations')
      .select('season_number, episode_number, annotation, imported_at')
      .eq('user_id', userId)
      .eq('tmdb_id', tvId)
      .eq('media_type', 'tv')
      .eq('annotation_scope', 'episode')),
    readPages(() => supabase.from('watch_events')
      .select('season_number, episode_number, source_rating, created_at')
      .eq('user_id', userId)
      .eq('tmdb_id', tvId)
      .eq('media_type', 'tv')
      .not('episode_number', 'is', null)),
  ]);
  return personalScoresFromRows({ annotations, events });
}

/** Same episode slots as the audience grid, scored from `yours` when that tab is on. */
export function gridForSource(grid, yours, source) {
  if (source !== 'yours') return grid || [];
  return (grid || []).map(season => ({
    ...season,
    episodes: season.episodes.map(episode => {
      const score = yours?.[`${season.seasonNumber}:${episode.episodeNumber}`];
      return { ...episode, score: score == null ? null : score, voteCount: null };
    }),
  }));
}

export function episodeAt(grid, seasonNumber, episodeNumber) {
  const season = (grid || []).find(item => item.seasonNumber === seasonNumber);
  return season?.episodes.find(episode => episode.episodeNumber === episodeNumber) || null;
}

export function episodeRowCount(grid) {
  let max = 0;
  for (const season of grid || []) {
    for (const episode of season.episodes) max = Math.max(max, episode.episodeNumber);
  }
  return max;
}

function laterThan(candidate, current) {
  return candidate.seasonNumber > current.seasonNumber
    || (candidate.seasonNumber === current.seasonNumber && candidate.episodeNumber > current.episodeNumber);
}

/**
 * Where the scores fall off. `holdThrough` is the last episode of the low
 * season that is still at least 7, when a later episode in that season drops
 * below 7. Ties go to the later episode.
 */
export function episodeRatingStory(grid) {
  let total = 0;
  let rated = 0;
  let low = null;
  for (const season of grid || []) {
    for (const episode of season.episodes) {
      total += 1;
      if (episode.score == null) continue;
      rated += 1;
      const candidate = {
        seasonNumber: season.seasonNumber,
        episodeNumber: episode.episodeNumber,
        name: episode.name,
        score: episode.score,
        voteCount: episode.voteCount,
      };
      if (!low || candidate.score < low.score || (candidate.score === low.score && laterThan(candidate, low))) {
        low = candidate;
      }
    }
  }
  if (!low) return { kind: 'empty', total, rated, low: null, holdThrough: null };

  const season = (grid || []).find(item => item.seasonNumber === low.seasonNumber);
  let holdThrough = null;
  let dropped = false;
  for (const episode of season?.episodes || []) {
    if (episode.score == null) continue;
    if (episode.score < HOLD_AT) {
      dropped = true;
      break;
    }
    holdThrough = episode.episodeNumber;
  }
  return {
    kind: dropped && holdThrough ? 'holds' : 'low',
    total,
    rated,
    low,
    holdThrough: dropped && holdThrough ? holdThrough : null,
  };
}

/** The sheet's sentence, plus a partial-progress line on Yours. */
export function episodeRatingSummary(story, source) {
  const yours = source === 'yours';
  if (!story?.low) return { story: null, rated: null };
  const score = formatEpisodeScore(story.low.score, yours ? 'yours' : 'tmdb');
  const line = story.kind === 'holds'
    ? MEDIA_PANEL.episodeRatingsHolds(story.low.seasonNumber, story.holdThrough, story.low.episodeNumber, score, yours)
    : MEDIA_PANEL.episodeRatingsLowPoint(story.low.seasonNumber, story.low.episodeNumber, score, yours);
  const rated = yours && story.rated > 0 && story.rated < story.total
    ? MEDIA_PANEL.episodeRatingsRated(story.rated, story.total)
    : null;
  return { story: line, rated };
}
