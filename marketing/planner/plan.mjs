// Daily content planner. Evaluates triggers for the next publish slot and
// inserts exactly one marketing_posts row (cadence: 1/day).
//
// Anchors: Monday (AEST) = weekly slate, Friday (AEST) = trending chart.
// Other days, priority ladder: countdown T-1 -> now streaming -> trailer drop
// -> T-7 -> T-14 -> on this day (relaxed threshold as final fallback).
import { getSupabase } from '../lib/supabase.mjs';
import { tmdb } from '../lib/tmdb.mjs';
import { nextPublishAt, weekdayInTz, isoDate } from '../lib/dates.mjs';
import * as weeklySlate from './triggers/weekly-slate.mjs';
import * as trendingChart from './triggers/trending-chart.mjs';
import { makeEvaluator as makeCountdown } from './triggers/countdown.mjs';
import * as nowStreaming from './triggers/now-streaming.mjs';
import * as trailerDrop from './triggers/trailer-drop.mjs';
import * as onThisDay from './triggers/on-this-day.mjs';

const TRACK_LIMIT = 25;

// Keep marketing_tracked_titles fresh: top upcoming titles by popularity, with
// region release dates. New rows get known_trailers seeded with the trailers
// that already exist, so we never announce an old trailer as "just dropped".
const maintainTrackedTitles = async (supabase) => {
  const [movies, tv] = await Promise.all([tmdb.getUpcomingMovies(), tmdb.getUpcomingTV()]);
  const top = [...movies, ...tv]
    .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
    .slice(0, TRACK_LIMIT);

  const { data: existing } = await supabase
    .from('marketing_tracked_titles')
    .select('*');
  const existingByKey = new Map((existing || []).map(t => [`${t.media_type}:${t.tmdb_id}`, t]));

  for (const item of top) {
    const key = `${item.media_type}:${item.id}`;
    const prior = existingByKey.get(key);
    const row = {
      media_type: item.media_type,
      tmdb_id: item.id,
      title: item.title || item.name,
      popularity: item.popularity,
      updated_at: new Date().toISOString(),
    };

    if (item.media_type === 'movie') {
      const { theatrical, digital } = await tmdb.getReleaseDates(item.id).catch(() => ({}));
      row.release_date = theatrical || item.release_date || null;
      row.digital_date = digital || null;
    } else {
      row.release_date = item.first_air_date || null;
    }

    if (!prior) {
      const trailers = await tmdb.getTrailers(item.media_type, item.id).catch(() => []);
      row.known_trailers = trailers.map(v => v.key);
    }

    const { error } = await supabase
      .from('marketing_tracked_titles')
      .upsert(row, { onConflict: 'media_type,tmdb_id' });
    if (error) console.warn(`Tracked-title upsert failed for ${row.title}: ${error.message}`);
  }

  const { data: tracked } = await supabase.from('marketing_tracked_titles').select('*');
  return tracked || [];
};

const insertPost = async (supabase, candidate, publishAt) => {
  const { error } = await supabase.from('marketing_posts').insert({
    post_type: candidate.post_type,
    topic_key: candidate.topic_key,
    status: candidate.status || 'planned',
    scheduled_for: publishAt.toISOString(),
    veto_expires_at: publishAt.toISOString(),
    tmdb_refs: candidate.tmdb_refs || [],
    payload: { ...candidate.payload, announce: candidate.announce || null },
  });
  if (error) {
    if (error.code === '23505') {
      console.log(`Already planned (${candidate.topic_key}) — nothing to do.`);
      return false;
    }
    throw new Error(`Insert failed: ${error.message}`);
  }
  return true;
};

const main = async () => {
  const supabase = getSupabase();
  const publishAt = nextPublishAt();
  const weekday = weekdayInTz(publishAt);
  console.log(`Planning for publish slot ${publishAt.toISOString()} (${weekday} AEST)`);

  const tracked = await maintainTrackedTitles(supabase);
  const ctx = { supabase, publishAt, weekday, tracked };

  const ladder = weekday === 'Monday' ? [weeklySlate.evaluate]
    : weekday === 'Friday' ? [trendingChart.evaluate]
    : [
        makeCountdown(1),
        nowStreaming.evaluate,
        trailerDrop.evaluate,
        makeCountdown(7),
        makeCountdown(14),
        (c) => onThisDay.evaluate(c),
      ];
  // Anchored days fall through to the ladder if the anchor has nothing.
  if (weekday === 'Monday' || weekday === 'Friday') {
    ladder.push(makeCountdown(1), nowStreaming.evaluate, trailerDrop.evaluate,
      makeCountdown(7), makeCountdown(14), (c) => onThisDay.evaluate(c));
  }
  // Final fallback: relax the anniversary threshold before giving up.
  ladder.push((c) => onThisDay.evaluate(c, { minVotes: 500 }));

  for (const evaluate of ladder) {
    const candidate = await evaluate(ctx);
    if (!candidate) continue;
    const inserted = await insertPost(supabase, candidate, publishAt);
    if (inserted) console.log(`Planned ${candidate.post_type} (${candidate.topic_key})`);
    return;
  }

  // Nothing triggered (rare): record it so the digest says "nothing today".
  await insertPost(supabase, {
    post_type: 'on_this_day',
    topic_key: `skipped:${isoDate(publishAt)}`,
    status: 'skipped',
    payload: {},
  }, publishAt);
  console.log('No content triggered today — recorded a skipped slot.');
};

main().catch((err) => { console.error(err); process.exit(1); });
