// Home's time-of-day greeting ("Good evening, Sam" / "Up late, Sam?").

import { DISCOVER_VIEW } from './copy/discoverView.js';

/** @typedef {'morning' | 'afternoon' | 'evening' | 'late'} PartOfDay */

/**
 * @param {number} hour 0–23, in the viewer's local time
 * @returns {PartOfDay}
 */
export function partOfDay(hour) {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late';
}

/**
 * @param {{ name?: string | null, date?: Date }} [opts]
 * @returns {string}
 */
export function greetingFor({ name, date = new Date() } = {}) {
  const part = partOfDay(date.getHours());
  const base = DISCOVER_VIEW.greeting[part];
  const first = String(name || '').trim();
  // "Up late" is a question; the others are statements.
  if (part === 'late') return first ? `${base}, ${first}?` : `${base}?`;
  return first ? `${base}, ${first}` : base;
}
