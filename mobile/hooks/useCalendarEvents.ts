import { useState, useEffect, useRef, useCallback } from 'react';
import { tmdb } from '../lib/tmdb';

export interface CalendarEvent {
  date: string;
  type: 'cinema' | 'streaming' | 'episode';
  label: string;
  item: {
    tmdb_id?: number | null;
    title?: string;
    poster_path?: string | null;
    media_type?: string;
    episode?: { name?: string; episode_number?: number; season_number?: number } | null;
  };
}

function localDateStr(d?: Date) {
  const date = d ?? new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function useCalendarEvents(
  watchlistItems: any[],
  watchingItems: any[],
) {
  const [events,  setEvents]  = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const cancelledRef = useRef(false);

  // Stable refs so the async build always reads the latest values without
  // being a dependency itself (prevents re-triggering on every render).
  const watchlistRef = useRef(watchlistItems);
  const watchingRef  = useRef(watchingItems);
  watchlistRef.current = watchlistItems;
  watchingRef.current  = watchingItems;

  // Derive string keys — effect only re-runs when content actually changes,
  // not on every render due to new array references.
  const watchlistKey = watchlistItems.map(i => i.tmdb_id ?? '').join(',');
  const watchingKey  = watchingItems.map(i => `${i.tmdb_id}:${i.current_season ?? 0}`).join(',');

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);

    const watchlistItems = watchlistRef.current;
    const watchingItems  = watchingRef.current;

    const all: CalendarEvent[] = [];

    // ── Watchlist movies: use stored release_date / streaming_date ──
    for (const item of watchlistItems) {
      if (item.media_type === 'tv') continue;
      if (item.release_date) {
        const isCinema = !!item.streaming_date;
        all.push({
          date:  item.release_date,
          type:  isCinema ? 'cinema' : 'streaming',
          label: isCinema ? 'Cinema' : 'Streaming',
          item:  { tmdb_id: item.tmdb_id, title: item.title || item.name, poster_path: item.poster_path, media_type: 'movie' },
        });
      }
      if (item.streaming_date) {
        all.push({
          date:  item.streaming_date,
          type:  'streaming',
          label: 'Streaming',
          item:  { tmdb_id: item.tmdb_id, title: item.title || item.name, poster_path: item.poster_path, media_type: 'movie' },
        });
      }
    }

    // ── Watchlist TV shows: fetch upcoming episodes ──
    const watchlistTv = watchlistItems.filter((i: any) => i.media_type === 'tv');
    const watchingTv  = watchingItems;

    // Merge watchlist + watching, deduping by tmdb_id.
    // Watching entries take priority (they carry a current_season).
    const tvMap = new Map<number, { tmdb_id: number; title: string; poster_path: string | null; season: number | null }>();
    for (const i of watchlistTv) {
      tvMap.set(i.tmdb_id, { tmdb_id: i.tmdb_id, title: i.title || i.name, poster_path: i.poster_path, season: null });
    }
    for (const i of watchingTv) {
      tvMap.set(i.tmdb_id, { tmdb_id: i.tmdb_id, title: i.title, poster_path: i.poster_path, season: i.current_season });
    }
    const allTv = Array.from(tvMap.values());

    Promise.allSettled(
      allTv.map(async (show) => {
        const details = await tmdb.getTVDetails(show.tmdb_id);
        if (cancelledRef.current || !details) return;

        const nextEpDate = details.next_episode_to_air?.air_date;
        if (nextEpDate) {
          all.push({
            date:  nextEpDate,
            type:  'episode',
            label: 'Episode',
            item: {
              tmdb_id:    show.tmdb_id,
              title:      show.title,
              poster_path: show.poster_path,
              media_type: 'tv',
              episode: {
                name:           details.next_episode_to_air?.name,
                episode_number: details.next_episode_to_air?.episode_number,
                season_number:  details.next_episode_to_air?.season_number,
              },
            },
          });
        }

        // Also fetch current-season episodes for watching items
        if (show.season) {
          const seasonData = await tmdb.getSeason(show.tmdb_id, show.season);
          if (cancelledRef.current || !seasonData?.episodes) return;
          for (const ep of seasonData.episodes) {
            if (ep.air_date) {
              all.push({
                date:  ep.air_date,
                type:  'episode',
                label: `S${String(ep.season_number).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`,
                item: {
                  tmdb_id:    show.tmdb_id,
                  title:      show.title,
                  poster_path: show.poster_path,
                  media_type: 'tv',
                  episode:    { name: ep.name, episode_number: ep.episode_number, season_number: ep.season_number },
                },
              });
            }
          }
        }
      })
    ).then(() => {
      if (cancelledRef.current) return;

      // Deduplicate: same show + same date + same episode number = same event
      const seen = new Set<string>();
      const deduped = all.filter(ev => {
        const epNum = ev.item.episode?.episode_number ?? 'x';
        const key = `${ev.item.tmdb_id}-${ev.date}-${epNum}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      deduped.sort((a, b) => a.date.localeCompare(b.date));
      setEvents(deduped);
      setLoading(false);
    });

    return () => { cancelledRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlistKey, watchingKey]);

  const eventsForDate = useCallback(
    (dateStr: string) => events.filter(e => e.date === dateStr),
    [events],
  );

  return { events, loading, eventsForDate };
}
