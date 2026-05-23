import { useState, useEffect, useCallback } from 'react';
import { localDateStr, dateToLocalStr } from '../utils/date.js';

/**
 * Builds calendar events from:
 *  - reminders (EPG episodes bookmarked by user)
 *  - watchlist items with release_date
 *  - watching_progress items (fetches ALL upcoming episode air dates)
 */
export function useCalendar(watchlistItems = [], watchingItems = [], fetchSeason, reminders = []) {
  const [events,  setEvents]  = useState([]); // [{ date, type, item }]
  const [loading, setLoading] = useState(true);

  const buildEvents = useCallback(async () => {
    setLoading(true);
    const all = [];
    const todayStr = localDateStr(); // local date, not UTC — critical for UTC+ timezones (e.g. Australia)

    // 0. EPG reminders
    for (const rem of reminders) {
      // Supabase returns date columns as "YYYY-MM-DD" strings.
      // If it's a Date object, convert using local date (not toISOString which is UTC).
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
          id:           rem.tvmaze_ep_id,   // used for dedup key
          tmdb_id:      null,
        },
      });
    }

    // 1. Watchlist items with known dates — both TV and movies use 'release'
    for (const item of watchlistItems) {
      const date = item.release_date;
      if (date) {
        all.push({
          date,
          type:  'release',
          label: 'Release',
          item,
        });
      }
    }

    // 2. In-progress shows — ALL upcoming episode air dates for current season
    for (const progress of watchingItems) {
      const season = await fetchSeason?.(progress.tmdb_id, progress.current_season);
      if (!season?.episodes) continue;

      for (const ep of season.episodes) {
        // Skip episodes already watched
        if (ep.episode_number < progress.current_episode) continue;
        // Skip episodes without an air date or that have already aired
        if (!ep.air_date || ep.air_date < todayStr) continue;

        all.push({
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
        });
      }
    }

    // Deduplicate by date + id
    const seen = new Set();
    const deduped = all.filter(ev => {
      const key = `${ev.date}-${ev.type}-${ev.item?.tmdb_id ?? ev.item?.id ?? ev.item?.title ?? ev.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    setEvents(deduped.sort((a, b) => a.date.localeCompare(b.date)));
    setLoading(false);
  }, [watchlistItems, watchingItems, fetchSeason, reminders]);

  useEffect(() => { buildEvents(); }, [buildEvents]);

  /** Get events for a specific date string YYYY-MM-DD */
  const eventsForDate = useCallback(
    (dateStr) => events.filter(e => e.date === dateStr),
    [events]
  );

  /** Get dates that have events in a given month */
  const datesWithEvents = useCallback(
    (year, month) => {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      const map = {};
      for (const ev of events) {
        if (ev.date.startsWith(prefix)) {
          if (!map[ev.date]) map[ev.date] = [];
          map[ev.date].push(ev.type);
        }
      }
      return map;
    },
    [events]
  );

  return { events, loading, eventsForDate, datesWithEvents };
}
