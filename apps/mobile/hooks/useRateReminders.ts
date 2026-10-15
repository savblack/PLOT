/**
 * The next-morning rating reminder. Watches the history store: a row that
 * appeared in the last couple of minutes, watched today, with no rating,
 * gets a 9am local notification (lib/ratePrompt.ts, one per day); a rating
 * landing on a row cancels its reminder. Mounted once at the root so every
 * mark path (title panel, first-win card, episode ticks) is covered without
 * each caller knowing.
 */
import { useEffect, useRef } from 'react';
import { localDateStr } from '@plot/core/date.js';
import { useAppData } from '../contexts/AppDataContext';
import { cancelRateReminder, scheduleRateReminder } from '../lib/ratePrompt';

type Entry = { tmdb_id: number; media_type: string; title: string; rating?: number | null; dnf?: boolean; watched_at?: string | null; created_at?: string | null; updatedAt?: string | null };

const FRESH_MS = 2 * 60 * 1000;

export default function useRateReminders() {
  const { userId, history } = useAppData();
  const seen = useRef<Map<string, number | null>>(new Map());
  const primed = useRef(false);

  useEffect(() => {
    const entries: Entry[] = history.entries ?? [];
    if (!userId || history.loading) return;
    const next = new Map<string, number | null>();
    const now = Date.now();
    const today = localDateStr();
    for (const e of entries) {
      const key = `${e.media_type}:${e.tmdb_id}`;
      next.set(key, e.rating ?? null);
      if (!primed.current) continue;
      const before = seen.current.get(key);
      const mediaType = e.media_type === 'tv' ? 'tv' : 'movie';
      // A rating landed on a row that was unrated (or new): no reminder.
      if (e.rating != null && before == null) { void cancelRateReminder({ tmdbId: e.tmdb_id, mediaType }); continue; }
      if (seen.current.has(key) || e.rating != null || e.dnf) continue;
      // New row: only a mark made just now, for today, not an import.
      const stamp = Date.parse(e.updatedAt ?? e.created_at ?? '');
      const fresh = Number.isFinite(stamp) ? now - stamp < FRESH_MS : false;
      const watchedToday = String(e.watched_at ?? '').slice(0, 10) === today;
      if (fresh && watchedToday) void scheduleRateReminder(userId, { tmdbId: e.tmdb_id, mediaType, title: e.title });
    }
    seen.current = next;
    primed.current = true;
  }, [userId, history.entries, history.loading]);

  // A different account starts from scratch.
  useEffect(() => { seen.current = new Map(); primed.current = false; }, [userId]);
}
