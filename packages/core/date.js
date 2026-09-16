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

/**
 * "Mar 12, 2026" from a date string, without going through UTC. Tolerates a full
 * ISO timestamp as well as a bare YYYY-MM-DD, because `history.watched_at`
 * comes back from Postgres as the former. Returns the input unchanged if it
 * cannot be parsed, so a bad row renders as itself rather than "Invalid Date".
 *
 * Fixed to the `en` locale, matching the media panel's own release-date line.
 * Not region-aware: day-first ordering for UK profiles would be a change to
 * every date in both apps, not just this one, so it is deliberately out of scope
 * here rather than quietly different from its neighbours.
 *
 * @param {string} value
 * @returns {string}
 */
export function formatWatchedOn(value) {
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(value);
  return new Date(y, m - 1, d).toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Short relative time for feed/notification timestamps: "just now", "5m ago",
 * "3h ago", "2d ago", then an absolute date once it's a week old.
 *
 * @param {string} iso
 * @param {number} [now] epoch ms, injectable so this is testable
 * @returns {string}
 */
export function relativeTime(iso, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/** Today, spelt out in the viewer's own locale ("Tuesday 15 September"). The
 *  line under the Home and Calendar page headings. */
export function todayLongLabel(now = new Date()) {
  return now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "October" while the year is the current one, "January 2027" once it is not.
 *  Month headings in the Calendar stream and its mini months. */
export function monthLongName(year, month, todayYear) {
  const d = new Date(year, month, 1);
  return d.toLocaleDateString('en', year === todayYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
}
