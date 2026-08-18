import { dateToLocalStr } from './date.js';

export function msUntilNextLocalMidnight(now = new Date()) {
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return Math.max(0, nextMidnight.getTime() - now.getTime());
}

export function buildWatchlistMovieCalendarEvents(item, todayStr) {
  if (item.media_type === 'tv') return [];

  const hasUpcomingRelease = item.release_date && item.release_date >= todayStr;
  const hasUpcomingStreaming = item.streaming_date && item.streaming_date >= todayStr;
  const isSameDayStreamingRelease =
    hasUpcomingRelease &&
    hasUpcomingStreaming &&
    item.release_date === item.streaming_date;

  const events = [];

  if (hasUpcomingRelease) {
    const isCinemaWindow = !isSameDayStreamingRelease;
    events.push({
      date: item.release_date,
      type: isSameDayStreamingRelease ? 'streaming' : isCinemaWindow ? 'cinema' : 'streaming',
      label: isSameDayStreamingRelease ? 'Streaming' : isCinemaWindow ? 'Cinema' : 'Streaming',
      item,
    });
  }

  if (hasUpcomingStreaming && !isSameDayStreamingRelease) {
    events.push({
      date: item.streaming_date,
      type: 'streaming',
      label: 'Streaming',
      item,
    });
  }

  return events;
}

function buildSortedSignature(items) {
  return items.slice().sort().join('||');
}

export function buildWatchlistCalendarSignature(items = []) {
  return buildSortedSignature(items.map(item => [
    item.tmdb_id ?? '',
    item.media_type ?? '',
    item.title ?? item.name ?? '',
    item.poster_path ?? '',
    item.release_date ?? '',
    item.streaming_date ?? '',
  ].join('|')));
}

export function buildWatchingCalendarSignature(items = []) {
  return buildSortedSignature(items.map(item => [
    item.tmdb_id ?? '',
    item.current_season ?? '',
    item.current_episode ?? '',
    item.title ?? '',
    item.poster_path ?? '',
  ].join('|')));
}

export function buildReminderCalendarSignature(items = []) {
  return buildSortedSignature(items.map(item => [
    item.tvmaze_ep_id ?? '',
    item.show_name ?? '',
    item.network_name ?? '',
    item.air_date ?? '',
    item.air_time ?? '',
  ].join('|')));
}

/** `S01E02`-style label for an episode row. */
function episodeLabel(seasonNumber, episodeNumber) {
  return `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
}

/* Dedupe key. Two sources can legitimately surface the same airing (a show can
   be on the watchlist *and* in progress), so identity is the airing itself:
   which title, which day, which kind of event. */
function calendarEventKey(ev) {
  return `${ev.date}-${ev.type}-${ev.item?.tmdb_id ?? ev.item?.id ?? ev.item?.title ?? ev.label}`;
}

/**
 * Build every calendar event for a user, from all three sources.
 *
 * This is the whole derivation: which airings count, how they're labelled,
 * which ones collapse together. Both apps call it and supply only the two
 * fetchers, so the rules can't drift per platform — mobile previously
 * re-derived all of this and disagreed on the upcoming-only filter, the
 * same-day release/streaming collapse, and the cinema-vs-streaming label.
 *
 * Fetchers are injected rather than imported so this is testable without a
 * network or a TMDB key.
 *
 * @param {object} args
 * @param {any[]} [args.watchlist] - saved titles (movies use stored dates; TV is fetched)
 * @param {any[]} [args.watching] - in-progress shows, carrying current_season/current_episode
 * @param {any[]} [args.reminders] - bookmarked EPG episodes (web only; mobile has no EPG)
 * @param {string} args.todayStr - local YYYY-MM-DD; the floor for "upcoming"
 * @param {(tmdbId: number) => Promise<any>} [args.fetchTvDetails]
 * @param {(tmdbId: number, seasonNumber: number) => Promise<any>} [args.fetchSeason]
 * @param {() => boolean} [args.isCancelled] - checked before returning, for unmount
 * @returns {Promise<any[]>} deduped, date-sorted events
 */
export async function buildCalendarEvents({
  watchlist = [],
  watching = [],
  reminders = [],
  todayStr,
  fetchTvDetails,
  fetchSeason,
  isCancelled = () => false,
}) {
  const all = [];

  // ── EPG reminders — already local, no fetch ──────────────────────────────
  for (const rem of reminders) {
    const dateStr = typeof rem.air_date === 'string'
      ? rem.air_date
      : (rem.air_date instanceof Date ? dateToLocalStr(rem.air_date) : null);
    if (!dateStr) continue;
    all.push({
      date:  dateStr,
      type:  'reminder',
      label: rem.air_time ?? 'Reminder',
      item: {
        title:        rem.show_name,
        network_name: rem.network_name,
        air_time:     rem.air_time,
        media_type:   'tv',
        id:           rem.tvmaze_ep_id,
        tmdb_id:      null,
      },
    });
  }

  // ── Watchlist movies — dates already stored, no fetch ─────────────────────
  for (const item of watchlist) {
    all.push(...buildWatchlistMovieCalendarEvents(item, todayStr));
  }

  // ── Watchlist TV — upcoming episodes of the relevant season ──────────────
  const watchlistTv = watchlist.filter(i => i.media_type === 'tv');
  const watchlistEpisodes = await Promise.all(
    watchlistTv.map(async (item) => {
      try {
        const details = await fetchTvDetails?.(item.tmdb_id);
        const seasonNum =
          details?.next_episode_to_air?.season_number ||
          details?.last_episode_to_air?.season_number ||
          details?.number_of_seasons ||
          1;
        const season = await fetchSeason?.(item.tmdb_id, seasonNum);
        if (!season?.episodes) return [];
        return season.episodes
          .filter(ep => ep.air_date && ep.air_date >= todayStr)
          .map(ep => ({
            date:  ep.air_date,
            type:  'episode',
            label: episodeLabel(seasonNum, ep.episode_number),
            item: {
              title:       item.title || item.name,
              poster_path: item.poster_path,
              tmdb_id:     item.tmdb_id,
              media_type:  'tv',
              episode:     ep,
            },
          }));
      } catch {
        return [];
      }
    })
  );
  all.push(...watchlistEpisodes.flat());

  // ── In-progress shows — only episodes at or ahead of where you are ───────
  const watchingEpisodes = await Promise.all(
    watching.map(async (progress) => {
      try {
        const season = await fetchSeason?.(progress.tmdb_id, progress.current_season);
        if (!season?.episodes) return [];
        return season.episodes
          .filter(ep =>
            ep.episode_number >= progress.current_episode &&
            ep.air_date && ep.air_date >= todayStr
          )
          .map(ep => ({
            date:  ep.air_date,
            type:  'episode',
            label: episodeLabel(progress.current_season, ep.episode_number),
            item: {
              title:       progress.title,
              poster_path: progress.poster_path,
              tmdb_id:     progress.tmdb_id,
              media_type:  'tv',
              episode:     ep,
            },
          }));
      } catch {
        return [];
      }
    })
  );
  all.push(...watchingEpisodes.flat());

  if (isCancelled()) return [];

  const seen = new Set();
  return all
    .filter(ev => {
      const key = calendarEventKey(ev);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getCalendarRelativeLabel(selectedDate, todayStr) {
  if (selectedDate === todayStr) return 'Today';

  const selected = new Date(`${selectedDate}T00:00:00`);
  const today = new Date(`${todayStr}T00:00:00`);
  const diff = Math.round((selected - today) / 86400000);

  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';

  return selected.toLocaleDateString('en', { weekday: 'long', month: 'short', day: 'numeric' });
}
