import { useState, useEffect, useCallback, useRef } from 'react';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import { tmdb } from '../api/tmdb.js';

/**
 * Builds calendar events from:
 *  - reminders (EPG episodes bookmarked by user)
 *  - watchlist items with release_date (movies) or upcoming episodes (TV shows)
 *  - watching_progress items (fetches ALL upcoming episode air dates)
 *
 * All network fetches are parallelised so the hook doesn't block on serial awaits.
 */
export function useCalendar(watchlistItems = [], watchingItems = [], fetchSeason, reminders = []) {
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnce = useRef(false);
  const buildInFlight = useRef(false);
  const cancelledRef  = useRef(false);

  const buildEvents = useCallback(async () => {
    // Prevent concurrent builds
    if (buildInFlight.current) return;
    buildInFlight.current = true;
    cancelledRef.current  = false;
    // Only show the full loading spinner on first load — subsequent rebuilds
    // update events in the background so there's no flash
    if (!hasLoadedOnce.current) setLoading(true);
    const todayStr = localDateStr();
    const all = [];

    // ── 0. EPG reminders (synchronous, no fetches needed) ──────────────────
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

    // ── 1. Watchlist movies (synchronous, dates already stored) ─────────────
    for (const item of watchlistItems) {
      if (item.media_type === 'tv') continue; // handled below in parallel
      if (item.release_date && item.release_date >= todayStr) {
        const isCinema = !!item.streaming_date;
        all.push({
          date:  item.release_date,
          type:  isCinema ? 'cinema' : 'streaming',
          label: isCinema ? 'Cinema' : 'Streaming',
          item,
        });
      }
      if (item.streaming_date && item.streaming_date >= todayStr) {
        all.push({
          date:  item.streaming_date,
          type:  'streaming',
          label: 'Streaming',
          item,
        });
      }
    }

    // ── 2. Watchlist TV shows — parallel fetch details + season ────────────
    const watchlistTv = watchlistItems.filter(i => i.media_type === 'tv');

    const tvEpisodes = await Promise.all(
      watchlistTv.map(async (item) => {
        try {
          const details = await tmdb.getTVDetails(item.tmdb_id);
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
              label: `S${String(seasonNum).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`,
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
    all.push(...tvEpisodes.flat());

    // ── 3. In-progress shows — parallel fetch seasons ──────────────────────
    const watchingEpisodes = await Promise.all(
      watchingItems.map(async (progress) => {
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
              label: `S${String(progress.current_season).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`,
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

    // ── Deduplicate and sort ───────────────────────────────────────────────
    const seen = new Set();
    const deduped = all.filter(ev => {
      const key = `${ev.date}-${ev.type}-${ev.item?.tmdb_id ?? ev.item?.id ?? ev.item?.title ?? ev.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (!cancelledRef.current) {
      setEvents(deduped.sort((a, b) => a.date.localeCompare(b.date)));
      hasLoadedOnce.current = true;
      setLoading(false);
    }
    buildInFlight.current = false;
  }, [watchlistItems, watchingItems, fetchSeason, reminders]);

  useEffect(() => {
    buildEvents();
    return () => { cancelledRef.current = true; buildInFlight.current = false; };
  }, [buildEvents]);

  const eventsForDate = useCallback(
    (dateStr) => events.filter(e => e.date === dateStr),
    [events]
  );

  return { events, loading, eventsForDate };
}
