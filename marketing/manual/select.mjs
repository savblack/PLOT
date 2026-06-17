// Choose the day's candidate posts. Two modes:
//   explicit  — caller names countdown titles and/or an anniversary id
//   auto      — run the full planner ladder and collect every type that fires
// Both return planner-shaped candidates: { post_type, topic_key, tmdb_refs, payload }.
import { tmdb } from '../lib/tmdb.mjs';
import { isoDate, daysBetween, formatWeekdayDayMonth } from '../lib/dates.mjs';
import { makeEvaluator as makeCountdown } from '../planner/triggers/countdown.mjs';
import * as nowStreaming from '../planner/triggers/now-streaming.mjs';
import * as trailerDrop from '../planner/triggers/trailer-drop.mjs';
import * as onThisDay from '../planner/triggers/on-this-day.mjs';
import * as weeklySlate from '../planner/triggers/weekly-slate.mjs';
import * as trendingChart from '../planner/triggers/trending-chart.mjs';

// A countdown for a specific tracked title at its real days-until (any number,
// not just the T-1/7/14 rungs the cron uses).
const countdownForTitle = async (ctx, name) => {
  const t = (ctx.tracked || []).find(x => x.title.toLowerCase() === name.toLowerCase());
  if (!t) throw new Error(`No tracked title matches "${name}"`);
  if (!t.release_date) throw new Error(`"${t.title}" has no release date`);
  const days = daysBetween(isoDate(ctx.publishAt), t.release_date);
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

// An anniversary post for a specific movie id (id must come from TMDB, never guessed).
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

export const selectCandidates = async (ctx, opts = {}) => {
  const out = [];
  for (const name of opts.countdown || []) out.push(await countdownForTitle(ctx, name));
  if (opts.otd) {
    const [id, years] = String(opts.otd).split(':');
    out.push(await otdForId(Number(id), Number(years || 10)));
  }
  if (out.length) return out;

  // Auto: collect one candidate from every ladder rung that fires today.
  const evals = [];
  if (ctx.weekday === 'Monday') evals.push(weeklySlate.evaluate);
  if (ctx.weekday === 'Friday') evals.push(trendingChart.evaluate);
  evals.push(
    makeCountdown(1), makeCountdown(7), makeCountdown(14),
    nowStreaming.evaluate, trailerDrop.evaluate,
    (c) => onThisDay.evaluate(c), (c) => onThisDay.evaluate(c, { minVotes: 500 }),
  );
  const seen = new Set();
  for (const ev of evals) {
    const c = await ev(ctx).catch(() => null);
    if (c && !seen.has(c.topic_key)) { seen.add(c.topic_key); out.push(c); }
  }
  return out;
};
