// The two moments that offer a share card without the user going looking
// for one (path 3 in docs/design/share-cards.md): a streak reaching a round
// number, and the first days of a month, when last month can be wrapped.
// Pure functions over history rows plus two small fetchers that pull only
// the rows those functions need, so neither moment has to load a whole
// history to answer.

import { supabase } from './supabase.js';
import { streaks, monthInsight, calendarParts } from './historyStats.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** 7, 14, 30, then every 30. */
export function isStreakMilestone(days) {
  return days === 7 || days === 14 || (days >= 30 && days % 30 === 0);
}

const pad = n => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * The streak worth a toast, or null: the current streak is a milestone and
 * today is part of it (so it is the watch just logged that got it there).
 * @param {any[]} entries rows with watched_at
 * @param {Date} [now]
 * @returns {{ days: number, day: string } | null}
 */
export function streakMoment(entries, now = new Date()) {
  const s = streaks(entries, now);
  if (!s.current || !isStreakMilestone(s.current)) return null;
  const today = isoDay(now);
  const watchedToday = entries.some(e => calendarParts(e.watched_at) && e.watched_at.slice(0, 10) === today);
  return watchedToday ? { days: s.current, day: today } : null;
}

/** { year, month (0-based) } of the month before `now`. */
export function lastMonth(now = new Date()) {
  const m = now.getMonth();
  return m === 0 ? { year: now.getFullYear() - 1, month: 11 } : { year: now.getFullYear(), month: m - 1 };
}

/** "YYYY-MM" for a month, the key the dismissal is stored under. */
export function monthKey({ year, month }) {
  return `${year}-${pad(month + 1)}`;
}

/**
 * Last month, wrapped, while the month is still fresh: the first `windowDays`
 * days of the month, at least `minTitles` watched. Null otherwise.
 * @param {any[]} entries rows for last month (more is fine; they are filtered)
 * @param {Date} [now]
 * @param {{ minTitles?: number, windowDays?: number }} [opts]
 * @returns {{ year: number, month: number, monthName: string, key: string, count: number, sentence: string | null } | null}
 */
export function monthWrapMoment(entries, now = new Date(), { minTitles = 5, windowDays = 7 } = {}) {
  if (now.getDate() > windowDays) return null;
  const { year, month } = lastMonth(now);
  const rows = entries.filter(e => { const p = calendarParts(e.watched_at); return p && p.year === year && p.month === month; });
  if (rows.length < minTitles) return null;
  const group = { year, month, entries: rows };
  return {
    year, month,
    monthName: MONTHS[month],
    key: monthKey({ year, month }),
    count: rows.length,
    sentence: monthInsight(group, [group], now),
  };
}

// ── fetchers ────────────────────────────────────────────────────────────────

/**
 * Watch days for the streak check: watched_at only, the last `days` days.
 * @param {string} userId
 * @param {{ days?: number, now?: Date }} [opts]
 * @returns {Promise<Array<{ watched_at: string }>>}
 */
export async function fetchWatchDays(userId, { days = 400, now = new Date() } = {}) {
  if (!userId) return [];
  const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  const { data, error } = await supabase
    .from('history')
    .select('watched_at')
    .eq('user_id', userId)
    .gte('watched_at', isoDay(since))
    .not('watched_at', 'is', null);
  if (error) { console.error('[shareMoments] watch days', error); return []; }
  return data || [];
}

/**
 * Everything the month-wrap sentence and card need for one month.
 * @param {string} userId
 * @param {{ year: number, month: number }} ym 0-based month
 * @returns {Promise<any[]>}
 */
export async function fetchMonthEntries(userId, { year, month }) {
  if (!userId) return [];
  const from = `${year}-${pad(month + 1)}-01`;
  const next = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
  const to = `${next.year}-${pad(next.month + 1)}-01`;
  const { data, error } = await supabase
    .from('history')
    .select('id, tmdb_id, media_type, title, poster_path, watched_at, rating, note, dnf, created_at')
    .eq('user_id', userId)
    .gte('watched_at', from)
    .lt('watched_at', to)
    .order('watched_at', { ascending: false });
  if (error) { console.error('[shareMoments] month entries', error); return []; }
  return data || [];
}
