// Date helpers for the planner. All "dates" from TMDB are YYYY-MM-DD strings.

export const isoDate = (d) => d.toISOString().slice(0, 10);

// The intended publish instant: today 23:30 UTC (9:30am AEST next day, ~6:30pm US ET).
export const nextPublishAt = (now = new Date()) => {
  const d = new Date(now);
  d.setUTCHours(23, 30, 0, 0);
  if (d <= now) d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

// Weekday name of an instant in a timezone (anchors are AEST publish days).
export const weekdayInTz = (date, tz = 'Australia/Sydney') =>
  new Intl.DateTimeFormat('en-AU', { weekday: 'long', timeZone: tz }).format(date);

// Whole days between two YYYY-MM-DD strings (b - a).
export const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// '2026-06-19' -> '19 June'
export const formatDayMonth = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// '2026-06-19' -> 'Friday 19 June'
export const formatWeekdayDayMonth = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};

// ('2026-06-15', '2026-06-21') -> '15 – 21 June' (or '28 June – 4 July')
export const formatWeekRange = (fromStr, toStr) => {
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  if (from.getUTCMonth() === to.getUTCMonth()) {
    return `${from.getUTCDate()} – ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}`;
  }
  return `${from.getUTCDate()} ${MONTHS[from.getUTCMonth()]} – ${to.getUTCDate()} ${MONTHS[to.getUTCMonth()]}`;
};

export const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
};
