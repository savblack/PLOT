// Watch-history grouping and labelling. Shared so web's month sections and
// mobile's match exactly — same bucketing, same labels, same empty copy.

import { ratingToStars } from './ratings.js';

/**
 * @param {number} year
 * @param {number} month Zero-based, as returned by Date#getMonth.
 * @returns {string} e.g. "2026-03"
 */
export function monthKey(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

/**
 * @param {{ watched_at?: string | null } | null | undefined} entry
 * @returns {string | null}
 */
export function entryMonthKey(entry) {
  if (!entry?.watched_at) return null;
  const d = new Date(entry.watched_at);
  return monthKey(d.getFullYear(), d.getMonth());
}

/**
 * @param {number} year
 * @param {number} month Zero-based.
 * @param {'long' | 'short'} [format]
 * @returns {string} e.g. "March 2026" / "Mar 2026"
 */
export function monthLabel(year, month, format = 'long') {
  return new Date(year, month, 1).toLocaleDateString('en', {
    month: format,
    year: 'numeric',
  });
}

/**
 * @template {{ watched_at?: string | null }} T
 * @param {T[]} entries
 * @param {number} year
 * @param {number} month Zero-based.
 * @returns {T[]}
 */
export function entriesForMonth(entries, year, month) {
  const selectedMonth = monthKey(year, month);
  return entries.filter(entry => entryMonthKey(entry) === selectedMonth);
}

/**
 * Buckets entries by watched month, skipping months with nothing in them.
 * Assumes `entries` is already sorted newest-first (as useHistory returns
 * it) — groups come out in that same newest-month-first order for free,
 * since the first time a month is seen nothing more recent remains unseen.
 *
 * @template {{ watched_at?: string | null }} T
 * @param {T[]} entries
 * @returns {{ year: number, month: number, key: string, entries: T[] }[]}
 */
export function groupEntriesByMonth(entries) {
  const groups = [];
  const byKey = new Map();
  for (const entry of entries) {
    const key = entryMonthKey(entry);
    if (key == null) continue;
    let group = byKey.get(key);
    if (!group) {
      const watched = new Date(entry.watched_at);
      group = { year: watched.getFullYear(), month: watched.getMonth(), key, entries: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/**
 * @param {{ year: number, month: number, isCurrentMonth?: boolean }} params
 * @returns {{ title: string, body: string }}
 */
export function historyMonthEmptyCopy({ year, month, isCurrentMonth }) {
  const title = `Nothing in ${monthLabel(year, month)}`;
  const body = isCurrentMonth
    ? 'Try another month or mark a title as watched to start filling your history.'
    : 'Try another month, or tap Today to jump back to your latest activity.';

  return { title, body };
}

/**
 * The star label shown on a history row: "4 ★" / "3.5 ★".
 *
 * @param {number | null | undefined} value 10-point stored rating.
 * @returns {string} Empty string when unrated.
 */
export function historyRatingLabel(value) {
  if (!value) return '';

  const stars = ratingToStars(value);
  if (!stars) return '';

  return `${Number.isInteger(stars) ? stars.toFixed(0) : stars.toFixed(1)} ★`;
}
