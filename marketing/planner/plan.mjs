// Daily content planner. Evaluates triggers for the next publish slot and
// inserts the day's marketing_posts rows (up to 4/day).
//
// Weekly cadence (US Eastern publish day). Posts are dated 9:00am Eastern
// unless a type has an entry in PUBLISH_TIME_BY_TYPE.
//   Monday    -> trending
//   Tuesday   -> upcoming, then the mid question
//   Wednesday -> watch_tonight / anniversary / fill
//   Thursday  -> trailer, else a countdown, else the fill mix; mid question
//   Friday    -> now_streaming, else the fill mix
//   Saturday  -> hidden_gem / anniversary / fill
//   Sunday    -> lead question, then on_this_day, else the fill mix
// Fill order is: now_streaming -> countdown T-1 -> trailer -> countdown T-7 ->
// countdown T-14. Thin days simply publish fewer posts.
import { getSupabase } from '../lib/supabase.mjs';
import { tmdb } from '../lib/tmdb.mjs';
import { nextPublishAt, weekdayInTz, isoDate, datePartsInTz, publishAtOn, addDays } from '../lib/dates.mjs';
import * as weeklySlate from './triggers/weekly-slate.mjs';
import * as trendingChart from './triggers/trending-chart.mjs';
import { makeEvaluator as makeCountdown } from './triggers/countdown.mjs';
import * as nowStreaming from './triggers/now-streaming.mjs';
import * as trailerDrop from './triggers/trailer-drop.mjs';
import * as onThisDay from './triggers/on-this-day.mjs';
import * as watchTonight from './triggers/watch-tonight.mjs';
import * as hiddenGem from './triggers/hidden-gem.mjs';
import * as conversation from './triggers/conversation.mjs';
import { anchorChainForDay, fixedFeatureForDay, questionSlotForDay } from './cadence.mjs';

const TRACK_LIMIT = 25;
// How long after a cinema opening we keep watching a title for its home release.
const HOME_WATCH_DAYS = 150;
const EVALUATORS = {
  upcoming: weeklySlate.evaluate,
  trending: trendingChart.evaluate,
  watch_tonight: watchTonight.evaluate,
  hidden_gem: hiddenGem.evaluate,
};

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

  // Titles that have already opened drop out of TMDB's "upcoming" set, so
  // their rows stopped being refreshed the week they released: exactly when a
  // digital date first appears. Keep refreshing recent releases that have not
  // had their home-arrival post yet, or cinema-to-rental never fires for them.
  const today = isoDate(new Date());
  const floor = isoDate(new Date(Date.now() - HOME_WATCH_DAYS * 86400000));
  const topKeys = new Set(top.map(item => `${item.media_type}:${item.id}`));
  const recent = (existing || []).filter(t =>
    t.media_type === 'movie' && !topKeys.has(`movie:${t.tmdb_id}`) &&
    t.release_date && t.release_date <= today && t.release_date >= floor &&
    !t.announced?.now_streaming);
  for (const t of recent) {
    const { theatrical, digital } = await tmdb.getReleaseDates(t.tmdb_id).catch(() => ({}));
    if (!theatrical && !digital) continue;
    const { error } = await supabase.from('marketing_tracked_titles')
      .update({ release_date: theatrical || t.release_date, digital_date: digital || t.digital_date || null, updated_at: new Date().toISOString() })
      .eq('id', t.id);
    if (error) console.warn(`Home-date refresh failed for ${t.title}: ${error.message}`);
  }

  const { data: tracked } = await supabase.from('marketing_tracked_titles').select('*');
  return tracked || [];
};

const insertPost = async (supabase, candidate, publishAt) => {
  const day = datePartsInTz(publishAt).date;
  const when = publishAtOn(day, candidate.post_type);
  const { error } = await supabase.from('marketing_posts').insert({
    post_type: candidate.post_type,
    topic_key: candidate.topic_key,
    status: candidate.status || 'planned',
    scheduled_for: when.toISOString(),
    veto_expires_at: when.toISOString(),
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
  const chain = anchorChainForDay(weekday);
  const featureType = fixedFeatureForDay(weekday);
  const questionSlot = questionSlotForDay(weekday);
  const isAnchor = chain.length > 0;

  // Compose the day's posts. An anchor chain that finds a candidate is the
  // day's post. A chain that finds nothing, and every non-anchor day, can
  // publish up to 4. A title never appears twice in one day.
  const DAILY_TARGET = 4;
  const candidates = [];
  const chosenIds = new Set();
  const consider = async (evaluate, opts) => {
    if (candidates.length >= DAILY_TARGET) return false;
    const c = await evaluate(ctx, opts);
    if (!c) return false;
    if (c.post_type === 'question' && candidates.some((row) => row.post_type === 'question')) return false;
    const id = c.tmdb_refs?.[0]?.id;
    if (id && chosenIds.has(id)) return false;
    candidates.push(c);
    if (id) chosenIds.add(id);
    return true;
  };

  // One question attempt per day. A second call (the fill path, after the
  // lead slot already ran) does not ask TMDB again.
  let questionTried = false;
  const addQuestion = async (opts) => {
    if (questionTried) return false;
    questionTried = true;
    return consider(conversation.evaluate, opts);
  };
  const hasNonQuestion = () => candidates.some((row) => row.post_type !== 'question');

  // Stop at the first candidate. Thursday tries a trailer, then a countdown.
  const considerChain = async () => {
    for (const step of chain) {
      if (step === 'countdown') {
        if (await consider(makeCountdown(1))) return;
        if (await consider(makeCountdown(7))) return;
        if (await consider(makeCountdown(14))) return;
      } else if (step === 'trailer') {
        if (await consider(trailerDrop.evaluate)) return;
      } else if (step === 'now_streaming') {
        if (await consider(nowStreaming.evaluate)) return;
      } else if (step === 'on_this_day') {
        if (await consider((c) => onThisDay.evaluate(c))) return;
        if (await consider((c) => onThisDay.evaluate(c, { minVotes: 500 }))) return;
      } else if (EVALUATORS[step]) {
        if (await consider(EVALUATORS[step])) return;
      }
    }
  };

  // Release-day spotlight, evaluated once so we can both detect a "major" release
  // and (otherwise) reuse it as the spotlight slot without a second TMDB call.
  // Anchor days fetch it only if their chain misses and did not already try it.
  let releaseFetched = !isAnchor;
  let release = isAnchor ? null : await nowStreaming.evaluate(ctx);

  // Major release = a top-tier tracked title (top 3 by popularity) hitting home
  // today. On those days we focus the day on it instead of the usual mix:
  // the release, a question about that same title, and one anniversary.
  const pops = tracked.map(t => t.popularity || 0).sort((a, b) => b - a);
  const majorBar = pops.length >= 3 ? pops[2] : Infinity;
  const popOf = (id) => tracked.find(t => t.tmdb_id === id)?.popularity || 0;
  const releaseId = release?.tmdb_refs?.[0]?.id;
  const isMajorRelease = !isAnchor && release && majorBar !== Infinity && popOf(releaseId) >= majorBar;

  // Titles the question must not claim. On a lead day the question runs
  // before the rest of the slate, so hold the release title back when we
  // already know it. Evaluated at call time: chosenIds grows as the day fills.
  const reservedIds = () => new Set(releaseId ? [...chosenIds, releaseId] : chosenIds);

  if (isMajorRelease) {
    // Lead with the release, then a question about that same title. That is
    // the one place a question deliberately shares the day's subject.
    const related = await conversation.evaluate(ctx, { subject: release.tmdb_refs[0] });
    candidates.push(release);
    if (related) candidates.push(related);
    chosenIds.add(releaseId);
    questionTried = true;
    await consider((c) => onThisDay.evaluate(c));
    if (candidates.length < 3) await consider((c) => onThisDay.evaluate(c, { minVotes: 500 }));
    console.log(`Major release detected (${release.tmdb_refs[0].title}) — focusing the day.`);
  } else {
    // Sunday's question leads. Tuesday and Thursday place it after the
    // non-question post. A chain that finds nothing falls through to the mix,
    // which is what guarantees Thursday, Friday, and Sunday still get a post.
    if (questionSlot === 'lead') await addQuestion({ exclude: reservedIds() });
    if (isAnchor) await considerChain();

    if (!hasNonQuestion()) {
      if (!releaseFetched && !chain.includes('now_streaming')) {
        releaseFetched = true;
        release = await nowStreaming.evaluate(ctx);
      }
      if (questionSlot === 'lead') await addQuestion({ exclude: reservedIds() });
      if (featureType) await consider(EVALUATORS[featureType]);
      await consider((c) => onThisDay.evaluate(c));
      if (!hasNonQuestion()) await consider((c) => onThisDay.evaluate(c, { minVotes: 500 }));
      await consider(() => release);
      if (questionSlot === 'mid') await addQuestion({ exclude: reservedIds() });
      await consider(makeCountdown(1));
      await consider(trailerDrop.evaluate);
      await consider(makeCountdown(7));
      await consider(makeCountdown(14));
    } else if (questionSlot === 'mid') {
      await addQuestion({ exclude: reservedIds() });
    }
  }

  if (!candidates.length) {
    // Nothing triggered (rare): record it so the digest says "nothing today".
    await insertPost(supabase, {
      post_type: 'on_this_day',
      topic_key: `skipped:${datePartsInTz(publishAt).date}`,
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
  console.log(`Planned ${planned} post(s) for ${datePartsInTz(publishAt).date} (${weekday} ET).`);
};

const main = async () => {
  const supabase = getSupabase();
  const tracked = await maintainTrackedTitles(supabase);
  // MARKETING_PLAN_DAYS=7 plans the whole upcoming week in one batch; default 1.
  const days = Math.max(1, Math.min(14, Number(process.env.MARKETING_PLAN_DAYS) || 1));
  const start = datePartsInTz(nextPublishAt()).date;
  for (let i = 0; i < days; i++) {
    const day = addDays(start, i);
    const publishAt = publishAtOn(day);
    console.log(`\n── ${weekdayInTz(publishAt)} ${day} ──`);
    await planSlot(supabase, publishAt, tracked);
  }
};

main().catch((err) => { console.error(err); process.exit(1); });
