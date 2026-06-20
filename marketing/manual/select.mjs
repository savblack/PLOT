// Choose the day's candidate posts. Two modes:
//   explicit  — caller names countdown titles and/or an anniversary id
//   auto      — follow the weekly SCHEDULE for the run date's weekday
// Returns planner-shaped candidates: { post_type, topic_key, tmdb_refs?, payload?,
// copyOnly? }. copyOnly candidates have no card template (the agent writes text,
// and picks a title where the type calls for one) — see schedule.mjs.
import { tmdb } from '../lib/tmdb.mjs';
import { isoDate, daysBetween, formatWeekdayDayMonth } from '../lib/dates.mjs';
import { makeEvaluator as makeCountdown } from '../planner/triggers/countdown.mjs';
import * as nowStreaming from '../planner/triggers/now-streaming.mjs';
import * as trailerDrop from '../planner/triggers/trailer-drop.mjs';
import * as onThisDay from '../planner/triggers/on-this-day.mjs';
import * as weeklySlate from '../planner/triggers/weekly-slate.mjs';
import * as trendingChart from '../planner/triggers/trending-chart.mjs';
import { SCHEDULE, TYPES } from './schedule.mjs';

const countdownFromTracked = async (t, today) => {
  const days = daysBetween(today, t.release_date);
  const details = await tmdb.getDetails(t.media_type, t.tmdb_id);
  const isStreaming = t.media_type === 'tv' ||
    (t.digital_date && (!t.release_date || t.digital_date <= t.release_date));
  let where = null;
  if (isStreaming) {
    const ps = await tmdb.getWatchProviders(t.media_type, t.tmdb_id).catch(() => []);
    if (ps.length) where = ps.slice(0, 2).map(p => p.provider_name).join(' · ');
  }
  return {
    post_type: 'countdown',
    topic_key: `manual:countdown:${t.media_type}:${t.tmdb_id}`,
    tmdb_refs: [{ media_type: t.media_type, id: t.tmdb_id, title: t.title }],
    payload: {
      days_until: days,
      kind: t.media_type === 'tv' ? 'tv' : (isStreaming ? 'streaming' : 'cinema'),
      when_label: formatWeekdayDayMonth(t.release_date),
      title: {
        tmdb_id: t.tmdb_id, media_type: t.media_type, title: t.title,
        overview: details?.overview || null,
        poster_path: details?.poster_path, backdrop_path: details?.backdrop_path || null, where,
      },
    },
  };
};

const countdownForTitle = async (ctx, name) => {
  const t = (ctx.tracked || []).find(x => x.title.toLowerCase() === name.toLowerCase());
  if (!t) throw new Error(`No tracked title matches "${name}"`);
  if (!t.release_date) throw new Error(`"${t.title}" has no release date`);
  return countdownFromTracked(t, ctx.today);
};

// Nearest upcoming tracked title (any days-out) — the daily countdown default.
const nearestCountdown = async (ctx) => {
  const t = (ctx.tracked || [])
    .filter(x => x.release_date && daysBetween(ctx.today, x.release_date) >= 0)
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))[0];
  return t ? countdownFromTracked(t, ctx.today) : null;
};

const otdForId = async (id, years) => {
  const d = await tmdb.getDetails('movie', id);
  if (!d?.id) throw new Error(`No TMDB movie ${id}`);
  return {
    post_type: 'on_this_day',
    topic_key: `manual:on_this_day:movie:${id}`,
    tmdb_refs: [{ media_type: 'movie', id, title: d.title }],
    payload: {
      years: Number(years),
      release_year: d.release_date ? Number(d.release_date.slice(0, 4)) : null,
      title: {
        tmdb_id: id, media_type: 'movie', title: d.title,
        overview: d.overview || null, poster_path: d.poster_path, backdrop_path: d.backdrop_path || null,
      },
    },
  };
};

// A copy-only candidate for a type with no card template yet.
const copyOnly = (type, date) => ({ post_type: type, topic_key: `manual:${type}:${date}`, copyOnly: true });

// One scheduled type -> a candidate (or null if nothing fired).
const buildScheduled = async (ctx, type) => {
  switch (type) {
    case 'upcoming': return weeklySlate.evaluate(ctx).catch(() => null);
    case 'trending': return trendingChart.evaluate(ctx).catch(() => null);
    case 'countdown': return nearestCountdown(ctx);
    case 'on_this_day':
      return (await onThisDay.evaluate(ctx).catch(() => null))
        || (await onThisDay.evaluate(ctx, { minVotes: 500 }).catch(() => null));
    default:
      return TYPES[type] ? copyOnly(type, ctx.today) : null; // spotlight, questions, etc.
  }
};

export const selectCandidates = async (ctx, opts = {}) => {
  const out = [];
  for (const name of opts.countdown || []) out.push(await countdownForTitle(ctx, name));
  if (opts.otd) {
    const [id, years] = String(opts.otd).split(':');
    out.push(await otdForId(Number(id), Number(years || 10)));
  }
  if (out.length) return out;

  // Auto: follow the weekly schedule for this run date's weekday.
  const types = SCHEDULE[ctx.weekday] || [];
  const seen = new Set();
  for (const type of types) {
    const c = await buildScheduled(ctx, type);
    if (c && !seen.has(c.topic_key)) { seen.add(c.topic_key); out.push(c); }
  }
  return out;
};
