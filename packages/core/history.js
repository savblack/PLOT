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
 * Pulls the year and zero-based month straight out of a "YYYY-MM-DD"
 * calendar-date string, without ever constructing a `Date` from it.
 *
 * `watched_at` is a plain calendar date with no time-of-day or timezone
 * meaning. `new Date('2026-01-01')` parses date-only strings as UTC midnight
 * (the ECMA-262 Date-only ISO 8601 rule), but `Date#getFullYear`/`getMonth`
 * read that back in local time — for any timezone behind UTC (most of the
 * Americas) that rolls the instant back into the previous day, which can
 * shift the bucket to the wrong month or even the wrong year. A `Date`
 * object has no way to represent "just a calendar date" without an implied
 * timezone, so parsing the digits out of the string sidesteps the ambiguity
 * entirely.
 *
 * @param {string | null | undefined} dateStr "YYYY-MM-DD"
 * @returns {{ year: number, month: number } | null} month is zero-based
 */
function calendarDateParts(dateStr) {
  const match = typeof dateStr === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr) : null;
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

/**
 * @param {{ watched_at?: string | null } | null | undefined} entry
 * @returns {string | null}
 */
export function entryMonthKey(entry) {
  const parts = calendarDateParts(entry?.watched_at);
  return parts ? monthKey(parts.year, parts.month) : null;
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
      const { year, month } = calendarDateParts(entry.watched_at);
      group = { year, month, key, entries: [] };
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
