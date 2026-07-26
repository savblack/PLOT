/**
 * Date utilities that are timezone-aware.
 *
 * IMPORTANT: always use these helpers instead of
 *   new Date().toISOString().split('T')[0]
 * which returns the *UTC* date — wrong for UTC+ users (e.g. Australia)
 * because the local "today" can be one day ahead of the UTC date.
 */

// User's chosen timezone (IANA name, e.g. "Australia/Sydney") from Settings.
// Falls back to the device's own timezone when unset, so behavior is unchanged
// for anyone who hasn't picked one.
let userTimezone = null;
export const setUserTimezone = (tz) => { userTimezone = tz || null; };
export const getUserTimezone = () => userTimezone;

function partsInTimezone(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: timezone || undefined,
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const part = (type) => parts.find(p => p.type === type)?.value;
    const y = part('year'), m = part('month'), d = part('day');
    return (y && m && d) ? { y, m, d } : null;
  } catch {
    return null;
  }
}

/**
 * Returns the date string "YYYY-MM-DD" for the user's set timezone (Settings →
 * Timezone), or the device's current timezone if none is set.
 * @param {number} offset - optional day offset (e.g. -1 for yesterday, 1 for tomorrow)
 */
export function localDateStr(offset = 0) {
  const now = new Date();
  const parts = userTimezone ? partsInTimezone(now, userTimezone) : null;
  if (parts) {
    if (!offset) return `${parts.y}-${parts.m}-${parts.d}`;
    // Anchor at UTC noon on that calendar day so adding whole days can't
    // cross a DST boundary and shift the date — pure calendar-day arithmetic.
    const anchored = new Date(`${parts.y}-${parts.m}-${parts.d}T12:00:00Z`);
    anchored.setUTCDate(anchored.getUTCDate() + offset);
    return anchored.toISOString().slice(0, 10);
  }
  const d = new Date();
  if (offset) d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Converts any Date object to a "YYYY-MM-DD" string using the user's set
 * timezone (Settings → Timezone), or the device's local timezone if none is set.
 */
export function dateToLocalStr(d) {
  const parts = userTimezone ? partsInTimezone(d, userTimezone) : null;
  if (parts) return `${parts.y}-${parts.m}-${parts.d}`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
