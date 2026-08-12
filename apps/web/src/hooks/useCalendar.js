import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { localDateStr } from '../utils/date.js';
import {
  buildReminderCalendarSignature,
  buildWatchingCalendarSignature,
  buildWatchlistCalendarSignature,
  buildCalendarEvents,
} from '../utils/calendar.js';
import { tmdb } from '@plot/core/tmdb.js';

/**
 * React plumbing around @plot/core's buildCalendarEvents: signatures so the
 * build only re-runs when content actually changed, a first-load-only spinner,
 * and an in-flight guard.
 *
 * The derivation itself — which airings count, how they're labelled, what
 * collapses together — lives in core so mobile runs the same rules.
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

    const built = await buildCalendarEvents({
      watchlist: stableWatchlistItemsRef.current,
      watching:  stableWatchingItemsRef.current,
      reminders: stableRemindersRef.current,
      todayStr:  localDateStr(),
      fetchTvDetails: (tmdbId) => tmdb.getTVDetails(tmdbId),
      fetchSeason:    (tmdbId, seasonNumber) => fetchSeason?.(tmdbId, seasonNumber),
      isCancelled:    () => cancelledRef.current,
    });

    if (!cancelledRef.current) {
      setEvents(built);
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
