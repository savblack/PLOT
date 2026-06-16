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

  // Compose the day's posts.
  //   Monday  -> "Upcoming this week" (single themed post)
  //   Friday  -> Trending top 10      (single themed post)
  //   Tue/Wed/Thu/Sat/Sun -> up to 4: a daily anniversary, a release-day
  //     spotlight (a title hitting home today), then countdowns + a trailer
  //     drop to fill. We never pad: thin days simply post fewer. A title never
  //     appears twice in one day. All posts share the slot (one publish run).
  const DAILY_TARGET = 4;
  const candidates = [];
  const chosenIds = new Set();
  const consider = async (evaluate, opts) => {
    if (candidates.length >= DAILY_TARGET) return;
    const c = await evaluate(ctx, opts);
    if (!c) return;
    const id = c.tmdb_refs?.[0]?.id;
    if (id && chosenIds.has(id)) return; // same title already covered today
    candidates.push(c);
    if (id) chosenIds.add(id);
  };

  const isAnchor = weekday === 'Monday' || weekday === 'Friday';
  if (weekday === 'Monday') await consider(weeklySlate.evaluate);
  else if (weekday === 'Friday') await consider(trendingChart.evaluate);

  // Non-anchor days — and anchor days whose theme found nothing — get the
  // anniversary + spotlight + dynamic-fill composition.
  if (!isAnchor || candidates.length === 0) {
    await consider((c) => onThisDay.evaluate(c));                          // anniversary (every day)
    if (!candidates.length) await consider((c) => onThisDay.evaluate(c, { minVotes: 500 }));
    await consider(nowStreaming.evaluate);                                 // release-day spotlight
    await consider(makeCountdown(1));                                      // additional dynamic posts
    await consider(trailerDrop.evaluate);
    await consider(makeCountdown(7));
    await consider(makeCountdown(14));
  }

  if (!candidates.length) {
    // Nothing triggered (rare): record it so the digest says "nothing today".
    await insertPost(supabase, {
      post_type: 'on_this_day',
      topic_key: `skipped:${isoDate(publishAt)}`,
      status: 'skipped',
      payload: {},
    }, publishAt);
    console.log('No content triggered today — recorded a skipped slot.');
    return;
  }

  let planned = 0;
  for (const c of candidates) {
    const inserted = await insertPost(supabase, c, publishAt);
    if (inserted) { planned++; console.log(`Planned ${c.post_type} (${c.topic_key})`); }
  }
  console.log(`Planned ${planned} post(s) for ${isoDate(publishAt)} (${weekday} AEST).`);
};

main().catch((err) => { console.error(err); process.exit(1); });
