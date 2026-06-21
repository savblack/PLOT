// Daily content planner. Evaluates triggers for the next publish slot and
// inserts the day's marketing_posts rows (up to 4/day).
//
// Weekly cadence (Sydney publish day):
//   Monday    -> upcoming
//   Tuesday   -> anniversary / spotlight / question / fill
//   Wednesday -> watch_tonight / anniversary / spotlight / fill
//   Thursday  -> anniversary / spotlight / question / fill
//   Friday    -> trending
//   Saturday  -> hidden_gem / anniversary / spotlight / fill
//   Sunday    -> question / anniversary / spotlight / fill
// Fill order is: now_streaming -> countdown T-1 -> trailer -> countdown T-7 ->
// countdown T-14. Thin days simply publish fewer posts.
import { getSupabase } from '../lib/supabase.mjs';
import { tmdb } from '../lib/tmdb.mjs';
import { nextPublishAt, weekdayInTz, isoDate } from '../lib/dates.mjs';
import * as weeklySlate from './triggers/weekly-slate.mjs';
import * as trendingChart from './triggers/trending-chart.mjs';
import { makeEvaluator as makeCountdown } from './triggers/countdown.mjs';
import * as nowStreaming from './triggers/now-streaming.mjs';
import * as trailerDrop from './triggers/trailer-drop.mjs';
import * as onThisDay from './triggers/on-this-day.mjs';
import * as watchTonight from './triggers/watch-tonight.mjs';
import * as hiddenGem from './triggers/hidden-gem.mjs';
import * as conversation from './triggers/conversation.mjs';
import { anchorPostForDay, fixedFeatureForDay, isAnchorDay, questionSlotForDay } from './cadence.mjs';

const TRACK_LIMIT = 25;
const EVALUATORS = {
  upcoming: weeklySlate.evaluate,
  trending: trendingChart.evaluate,
  watch_tonight: watchTonight.evaluate,
  hidden_gem: hiddenGem.evaluate,
};

const genericQuestion = (publishAt) => ({
  post_type: 'question',
  topic_key: `conversation:${isoDate(publishAt)}`,
  tmdb_refs: [],
  payload: { topic: { mode: 'generic' } },
});

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

// Plan one publish slot (one day). Reused for a single day or every day of the
// weekly batch (MARKETING_PLAN_DAYS).
const planSlot = async (supabase, publishAt, tracked) => {
  const weekday = weekdayInTz(publishAt);
  const ctx = { supabase, publishAt, weekday, tracked };
  const anchorType = anchorPostForDay(weekday);
  const featureType = fixedFeatureForDay(weekday);
  const questionSlot = questionSlotForDay(weekday);

  // Compose the day's posts. Anchors are single themed posts; non-anchor days can
  // publish up to 4. A title never appears twice in one day.
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

  const isAnchor = isAnchorDay(weekday);

  // Release-day spotlight, evaluated once so we can both detect a "major" release
  // and (otherwise) reuse it as the spotlight slot without a second TMDB call.
  const release = isAnchor ? null : await nowStreaming.evaluate(ctx);

  // Major release = a top-tier tracked title (top 3 by popularity) hitting home
  // today. On those days we focus the day on it instead of the usual mix:
  // the release + a question about it + the day's anniversary (3 posts).
  const pops = tracked.map(t => t.popularity || 0).sort((a, b) => b - a);
  const majorBar = pops.length >= 3 ? pops[2] : Infinity;
  const popOf = (id) => tracked.find(t => t.tmdb_id === id)?.popularity || 0;
  const releaseId = release?.tmdb_refs?.[0]?.id;
  const isMajorRelease = !isAnchor && release && majorBar !== Infinity && popOf(releaseId) >= majorBar;

  if (isMajorRelease) {
    candidates.push(release, { // lead + a related question
      post_type: 'question',
      topic_key: `conversation:${isoDate(publishAt)}`,
      tmdb_refs: [],
      payload: { topic: { mode: 'generic' } },
    });
    chosenIds.add(releaseId);
    await consider((c) => onThisDay.evaluate(c)); // one unrelated post
    if (candidates.length < 3) await consider((c) => onThisDay.evaluate(c, { minVotes: 500 }));
    console.log(`Major release detected (${release.tmdb_refs[0].title}) — focusing the day.`);
  } else {
    if (anchorType) {
      await consider(EVALUATORS[anchorType]);
    }

    // Non-anchor days follow the weekly cadence. Sunday questions lead; Tue/Thu
    // questions sit in the middle of the mix.
    if (!isAnchor || candidates.length === 0) {
      if (questionSlot === 'lead') await consider(() => genericQuestion(publishAt));
      if (featureType) await consider(EVALUATORS[featureType]);
      await consider((c) => onThisDay.evaluate(c));
      if (!candidates.length) await consider((c) => onThisDay.evaluate(c, { minVotes: 500 }));
      await consider(() => release);
      if (questionSlot === 'mid') await consider(conversation.evaluate);
      await consider(makeCountdown(1));
      await consider(trailerDrop.evaluate);
      await consider(makeCountdown(7));
      await consider(makeCountdown(14));
    }
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

const main = async () => {
  const supabase = getSupabase();
  const tracked = await maintainTrackedTitles(supabase);
  // MARKETING_PLAN_DAYS=7 plans the whole upcoming week in one batch; default 1.
  const days = Math.max(1, Math.min(14, Number(process.env.MARKETING_PLAN_DAYS) || 1));
  const base = nextPublishAt();
  for (let i = 0; i < days; i++) {
    const publishAt = new Date(base);
    publishAt.setUTCDate(publishAt.getUTCDate() + i);
    console.log(`\n── ${weekdayInTz(publishAt)} ${isoDate(publishAt)} ──`);
    await planSlot(supabase, publishAt, tracked);
  }
};

main().catch((err) => { console.error(err); process.exit(1); });
