// Date helpers for the planner. All "dates" from TMDB are YYYY-MM-DD strings.
// Publish instants are US Eastern (America/New_York). Daylight time is handled
// by the zone, not by a fixed UTC offset.

import { PUBLISH_TZ, zonedInstant } from '../../supabase/functions/_shared/etTime.js';

export { PUBLISH_TZ, zonedInstant };

export const isoDate = (d) => d.toISOString().slice(0, 10);

/** Default publish clock: 9:00am Eastern. */
export const DEFAULT_PUBLISH_TIME = { hour: 9, minute: 0 };

/**
 * Optional per-type wall-clock overrides, in Eastern Time.
 * A type that is not listed uses DEFAULT_PUBLISH_TIME.
 * @type {Record<string, {hour: number, minute: number}>}
 */
export const PUBLISH_TIME_BY_TYPE = {};

export const publishTimeFor = (postType) =>
  (postType && PUBLISH_TIME_BY_TYPE[postType]) || DEFAULT_PUBLISH_TIME;

// Weekday name of an instant. Anchors are US Eastern publish days.
export const weekdayInTz = (date, tz = PUBLISH_TZ) =>
  new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: tz }).format(date);

export const datePartsInTz = (date, tz = PUBLISH_TZ) => {
  const parts = new Intl.DateTimeFormat('en-US', {
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

/** 9:00am Eastern on `day`, or that type's override if one is set. */
export const publishAtOn = (day, postType) => {
  const { hour, minute } = publishTimeFor(postType);
  return zonedInstant(day, hour, minute, PUBLISH_TZ);
};

// The next publish instant at or after `now`: today at the type's Eastern
// clock time, or tomorrow if that instant has already passed.
export const nextPublishAt = (now = new Date(), postType) => {
  const { date } = datePartsInTz(now);
  const today = publishAtOn(date, postType);
  if (today > now) return today;
  return publishAtOn(addDays(date, 1), postType);
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

export const mondayOfWeekInTz = (date, tz = PUBLISH_TZ) => {
  const local = datePartsInTz(date, tz);
  return addDays(local.date, -(MONDAY_OFFSET[local.weekday] ?? 0));
};

// Days back from a US Eastern weekday to the Sunday that feeds Monday's chart.
// Sunday itself is that Sunday. Monday through Saturday step back to the
// Sunday just past, so a job that starts after midnight Eastern still dates
// the row to Sunday night.
const DAYS_SINCE_SUNDAY = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

export const trendingSnapshotDate = (now = new Date()) => {
  const { date, weekday } = datePartsInTz(now);
  return addDays(date, -(DAYS_SINCE_SUNDAY[weekday] ?? 0));
};

/** A snapshot is stale when it is missing or older than this week's Sunday. */
export const snapshotIsStale = (snapshotDate, publishAt) => {
  const expected = trendingSnapshotDate(publishAt);
  return !snapshotDate || String(snapshotDate).slice(0, 10) < expected;
};
