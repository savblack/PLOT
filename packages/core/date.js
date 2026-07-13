/**
 * Date utilities that are timezone-aware.
 *
 * IMPORTANT: always use these helpers instead of
 *   new Date().toISOString().split('T')[0]
 * which returns the *UTC* date — wrong for UTC+ users (e.g. Australia)
 * because the local "today" can be one day ahead of the UTC date.
 */

/**
 * Returns the local date string "YYYY-MM-DD" for the device's current timezone.
 * @param {number} offset - optional day offset (e.g. -1 for yesterday, 1 for tomorrow)
 */
export function localDateStr(offset = 0) {
  const d = new Date();
  if (offset) d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Converts any Date object to a "YYYY-MM-DD" string using the device's local timezone.
 */
export function dateToLocalStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
