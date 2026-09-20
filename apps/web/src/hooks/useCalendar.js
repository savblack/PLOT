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
/**
 * @param {object} [opts]
 * @param {boolean} [opts.ready=true]  false while the lists this derives from are
 *   still loading. The first build used to run against empty lists and finish
 *   instantly, so the page showed "Nothing coming up" for a beat before the
 *   real events arrived. Nothing is built, and `loading` stays true, until
 *   the inputs are real.
 */
export function useCalendar(watchlistItems = [], watchingItems = [], fetchSeason, reminders = [], { ready = true } = {}) {
  const [events,  setEvents]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
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
    if (hasLoadedOnce.current) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
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
      }
    } catch (buildError) {
      if (!cancelledRef.current) setError(buildError);
    } finally {
      if (!cancelledRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
      buildInFlight.current = false;
    }
  }, [fetchSeason]);

  useEffect(() => {
    if (!ready) return undefined;
    buildEvents();
    return () => { cancelledRef.current = true; buildInFlight.current = false; };
  }, [buildEvents, ready, remindersSignature, watchlistSignature, watchingSignature]);

  const eventsForDate = useCallback(
    (dateStr) => events.filter(e => e.date === dateStr),
    [events]
  );

  return { events, loading, refreshing, error, retry: buildEvents, eventsForDate };
}
