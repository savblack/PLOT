import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { tmdb } from '../lib/tmdb';
import { localDateStr } from '@plot/core/date.js';
import {
  buildCalendarEvents,
  buildWatchlistCalendarSignature,
  buildWatchingCalendarSignature,
} from '@plot/core/calendar.js';

export interface CalendarEvent {
  date: string;
  type: 'cinema' | 'streaming' | 'episode' | 'reminder';
  label: string;
  item: {
    tmdb_id?: number | null;
    title?: string;
    poster_path?: string | null;
    media_type?: string;
    episode?: { name?: string; episode_number?: number; season_number?: number } | null;
  };
}

/**
 * React plumbing around @plot/core's buildCalendarEvents.
 *
 * The derivation used to live here, hand-written, and disagreed with web on
 * every rule: it listed releases that had already happened, emitted two events
 * for a movie whose release and streaming dates are the same day, called any
 * movie with a streaming_date "Cinema", and keyed its rebuild signature on
 * tmdb_id alone — so a streaming_date arriving later never rebuilt the
 * calendar. All of that is now core's, and covered by core's tests.
 *
 * `reminders` has no mobile equivalent (there is no EPG surface here), so that
 * arm of the build is simply empty.
 */
export function useCalendarEvents(
  watchlistItems: any[],
  watchingItems: any[],
) {
  const [events,  setEvents]  = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);
  const hasLoadedOnce = useRef(false);

  // Stable refs so the async build always reads the latest values without
  // being a dependency itself (prevents re-triggering on every render).
  // Synced in effects, not during render, same as web's useCalendar.
  const watchlistRef = useRef(watchlistItems);
  const watchingRef  = useRef(watchingItems);

  /* Signatures come from core so both apps agree on what counts as a change.
     Keying on tmdb_id alone (what this used to do) meant a title's dates could
     change under us and the calendar would never notice. */
  const watchlistSignature = useMemo(
    () => buildWatchlistCalendarSignature(watchlistItems), [watchlistItems],
  );
  const watchingSignature = useMemo(
    () => buildWatchingCalendarSignature(watchingItems), [watchingItems],
  );

  useEffect(() => {
    watchlistRef.current = watchlistItems;
  }, [watchlistSignature, watchlistItems]);

  useEffect(() => {
    watchingRef.current = watchingItems;
  }, [watchingSignature, watchingItems]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!hasLoadedOnce.current) setLoading(true);

    buildCalendarEvents({
      watchlist: watchlistRef.current,
      watching:  watchingRef.current,
      todayStr:  localDateStr(),
      fetchTvDetails: (tmdbId: number) => tmdb.getTVDetails(tmdbId),
      fetchSeason:    (tmdbId: number, seasonNumber: number) => tmdb.getSeason(tmdbId, seasonNumber),
      isCancelled:    () => cancelledRef.current,
    }).then((built: CalendarEvent[]) => {
      if (cancelledRef.current) return;
      setEvents(built);
      hasLoadedOnce.current = true;
      setLoading(false);
    });

    return () => { cancelledRef.current = true; };
  }, [watchlistSignature, watchingSignature]);

  const eventsForDate = useCallback(
    (dateStr: string) => events.filter(e => e.date === dateStr),
    [events],
  );

  return { events, loading, eventsForDate };
}
