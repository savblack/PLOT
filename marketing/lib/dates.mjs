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

export const datePartsInTz = (date, tz = 'Australia/Sydney') => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'long',
  }).formatToParts(date);
  const pick = (type) => parts.find((part) => part.type === type)?.value;
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    weekday: pick('weekday'),
  };
};

// Whole days between two YYYY-MM-DD strings (b - a).
export const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

// Reader-facing marketing dates use US order. '2026-06-19' -> 'June 19'
export const formatDayMonth = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

// The charts header date. New payloads are already "October 12". A row planned
// before that change stored "Week of 12 October"; flip it at render so the
// card does not keep day-first order.
export const chartWeekDate = (weekLabel) => {
  const raw = String(weekLabel || '').replace(/^week of\s+/i, '').trim();
  const dayFirst = raw.match(/^(\d{1,2}) ([A-Za-z]+)$/);
  return dayFirst ? `${dayFirst[2]} ${dayFirst[1]}` : raw;
};

// '2026-06-19' -> 'Friday, June 19'; a date outside `relativeTo`'s year keeps its
// year -> 'Saturday, July 24, 2027'. Without that, a release far enough out reads as
// a date that has already been and gone: a trailer post written in September
// 2026 for a July 2027 film said "It arrives Friday, July 24", which a reader
// dates to the previous July. Same-year dates are unchanged.
export const formatWeekdayDayMonth = (dateStr, relativeTo = new Date()) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const base = `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return d.getUTCFullYear() === relativeTo.getUTCFullYear() ? base : `${base}, ${d.getUTCFullYear()}`;
};

// ('2026-06-15', '2026-06-21') -> 'June 15 to 21' (or 'June 28 to July 4')
//
// "to", not an en dash. This label is copied verbatim into the week's social
// posts and printed on the slate card, and Plot's copy rule bans en and em
// dashes in anything a reader sees. Four published weekly posts carried
// "1 – 7 June" because the dash came from here rather than from the writer.
export const formatWeekRange = (fromStr, toStr) => {
  const from = new Date(`${fromStr}T00:00:00Z`);
  const to = new Date(`${toStr}T00:00:00Z`);
  if (from.getUTCMonth() === to.getUTCMonth()) {
    return `${MONTHS[from.getUTCMonth()]} ${from.getUTCDate()} to ${to.getUTCDate()}`;
  }
  return `${MONTHS[from.getUTCMonth()]} ${from.getUTCDate()} to ${MONTHS[to.getUTCMonth()]} ${to.getUTCDate()}`;
};

export const addDays = (dateStr, days) => {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
};

const MONDAY_OFFSET = {
  Monday: 0,
  Tuesday: 1,
  Wednesday: 2,
  Thursday: 3,
  Friday: 4,
  Saturday: 5,
  Sunday: 6,
};

export const mondayOfWeekInTz = (date, tz = 'Australia/Sydney') => {
  const local = datePartsInTz(date, tz);
  return addDays(local.date, -(MONDAY_OFFSET[local.weekday] ?? 0));
};
