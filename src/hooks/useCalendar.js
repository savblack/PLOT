import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { localDateStr, dateToLocalStr } from '../utils/date.js';
import {
  buildReminderCalendarSignature,
  buildWatchingCalendarSignature,
  buildWatchlistCalendarSignature,
  buildWatchlistMovieCalendarEvents,
} from '../utils/calendar.js';
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
  const stableWatchlistItemsRef = useRef(watchlistItems);
  const stableWatchingItemsRef = useRef(watchingItems);
  const stableRemindersRef = useRef(reminders);

  const watchlistSignature = useMemo(() => buildWatchlistCalendarSignature(watchlistItems), [watchlistItems]);
  const watchingSignature = useMemo(() => buildWatchingCalendarSignature(watchingItems), [watchingItems]);
  const remindersSignature = useMemo(() => buildReminderCalendarSignature(reminders), [reminders]);

  useEffect(() => {
    stableWatchlistItemsRef.current = watchlistItems;
  }, [watchlistSignature, watchlistItems]);

  useEffect(() => {
    stableWatchingItemsRef.current = watchingItems;
  }, [watchingSignature, watchingItems]);

  useEffect(() => {
    stableRemindersRef.current = reminders;
  }, [remindersSignature, reminders]);

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
    for (const rem of stableRemindersRef.current) {
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
    for (const item of stableWatchlistItemsRef.current) {
      all.push(...buildWatchlistMovieCalendarEvents(item, todayStr));
    }

    // ── 2. Watchlist TV shows — parallel fetch details + season ────────────
    const watchlistTv = stableWatchlistItemsRef.current.filter(i => i.media_type === 'tv');

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
      stableWatchingItemsRef.current.map(async (progress) => {
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
  }, [fetchSeason]);

  useEffect(() => {
    buildEvents();
    return () => { cancelledRef.current = true; buildInFlight.current = false; };
  }, [buildEvents, remindersSignature, watchlistSignature, watchingSignature]);

  const eventsForDate = useCallback(
    (dateStr) => events.filter(e => e.date === dateStr),
    [events]
  );

  return { events, loading, eventsForDate };
}
