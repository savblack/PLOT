// Topical question post (Threads + X): a genuine question about a new release
// that is ACTUALLY OUT. The point is to join the conversation already happening
// around the most trending new releases — reactions, verdicts, whether people
// got to it yet — not to speculate about something unreleased. Nothing upcoming
// is ever a subject here.
//
// Questions used to be deliberately generic and title-free. VOICE.md always
// allowed both ("sometimes hooked to what's releasing/trending"); the code
// forced generic. This is the code catching up, narrowed to released titles.
import { tmdb } from '../../lib/tmdb.mjs';
import { isoDate, formatDayMonth } from '../../lib/dates.mjs';
import { recentlyUsed } from './_used.mjs';

// What counts as a "new" release, and the wider window we'll settle for rather
// than skip the slot. Both still require the title to be out. Kept tight on
// purpose: the slot exists to be on trend, so a title nobody is still talking
// about is worth less than an empty slot.
const NEW_RELEASE_DAYS = 14;
const WIDER_DAYS = 30;
// Trending items to weigh, and how many TV details lookups that may cost.
const SCAN_LIMIT = 25;
const TV_SCAN_LIMIT = 15;
// Don't ask about the same title twice inside this window.
const REUSE_DAYS = 30;

const byPopularity = (a, b) => (b.popularity || 0) - (a.popularity || 0);
const daysBefore = (date, days) => isoDate(new Date(date.getTime() - days * 86400000));

// When a trending item became watchable, or null if it isn't out yet.
//
// For TV that deliberately looks past the premiere: a returning season is one of
// the best conversation hooks there is, and filtering on first_air_date alone
// would throw away every show that premiered in an earlier year but is dropping
// episodes right now.
const releasedAt = async (item, today) => {
  const first = item.release_date || item.first_air_date || null;
  if (!first || first > today) return null; // unreleased, or undated — never a subject
  if (item.media_type !== 'tv') return { at: first, airing: false };

  const details = await tmdb.getDetails('tv', item.id).catch(() => null);
  const aired = details?.last_episode_to_air?.air_date || null;
  return aired && aired <= today && aired > first
    ? { at: aired, airing: true }
    : { at: first, airing: false };
};

// The most trending thing that's actually out. Prefers a genuinely new release,
// then widens once rather than leaving the slot empty.
const resolveTrendingRelease = async (ctx, today, skip) => {
  // Warn rather than swallow: an empty slot is a legitimate outcome here ("nothing
  // on trend this week"), so without this a TMDB outage or a bad key looks
  // exactly like a quiet week and no one finds out for days.
  const fetched = await tmdb.getTrending('all', 'week').catch((err) => {
    console.warn(`Question trigger: trending fetch failed (${err.message}) — no subject this slot.`);
    return null;
  });
  if (!fetched) return null;
  if (!fetched.length) console.warn('Question trigger: trending returned no items.');

  const trending = fetched
    .filter(m => ['movie', 'tv'].includes(m.media_type) && m.id && !skip.has(m.id))
    .sort(byPopularity)
    .slice(0, SCAN_LIMIT);

  const out = [];
  let tvLookups = 0;
  for (const item of trending) {
    if (item.media_type === 'tv') {
      if (tvLookups >= TV_SCAN_LIMIT) continue;
      tvLookups++;
    }
    const rel = await releasedAt(item, today);
    if (rel) out.push({ item, ...rel });
  }

  // `out` is still popularity-ordered, so the first match in a window is the
  // most trending title in it.
  const within = (days) => {
    const floor = daysBefore(ctx.publishAt, days);
    return out.find(o => o.at >= floor) || null;
  };
  const hit = within(NEW_RELEASE_DAYS) || within(WIDER_DAYS);
  if (!hit) return null;

  return {
    hook: hit.airing ? 'airing' : 'just_out',
    when_label: formatDayMonth(hit.at),
    media_type: hit.item.media_type,
    id: hit.item.id,
    title: hit.item.title || hit.item.name,
  };
};

const resolveSubject = async (ctx, today, skip) => {
  // Out today: a tracked title reaching cinemas or home this very day. Sharpest
  // hook there is, and release day is the day people are actually talking.
  const outToday = (ctx.tracked || [])
    .filter(t => t.tmdb_id && !skip.has(t.tmdb_id))
    .filter(t => t.digital_date === today || t.release_date === today)
    .sort(byPopularity)[0];
  if (outToday) {
    return {
      hook: 'out_today',
      when_label: null,
      media_type: outToday.media_type,
      id: outToday.tmdb_id,
      title: outToday.title,
    };
  }

  return resolveTrendingRelease(ctx, today, skip);
};

/**
 * @param {object} ctx  { supabase, publishAt, weekday, tracked }
 * @param {object} [opts]
 * @param {Set<number>} [opts.exclude]  tmdb ids the day already covers
 * @param {{media_type: string, id: number, title: string, hook?: string}} [opts.subject]
 *   Force the subject — used on major-release days, where the question is
 *   deliberately about the title that just landed.
 * @returns {Promise<object|null>} null when nothing released qualifies, which
 *   leaves the slot empty rather than asking about something unreleased.
 */
export const evaluate = async (ctx, { exclude, subject } = {}) => {
  const today = isoDate(ctx.publishAt);

  let pick = subject ? { hook: 'out_today', when_label: null, ...subject } : null;
  if (!pick) {
    const skip = new Set([
      ...(exclude || []),
      ...(await recentlyUsed(ctx.supabase, 'question', REUSE_DAYS)),
    ]);
    pick = await resolveSubject(ctx, today, skip);
  }
  if (!pick) return null;

  return {
    post_type: 'question',
    // One question per day: topic_key is UNIQUE, so this is also the idempotency
    // anchor for a re-run of the same slot.
    topic_key: `conversation:${today}`,
    tmdb_refs: [{ media_type: pick.media_type, id: pick.id, title: pick.title }],
    payload: {
      topic: { mode: 'topical', hook: pick.hook, when_label: pick.when_label || null },
      // Never rendered — question posts are text-only (generate.mjs short-circuits
      // before POST_TYPES). This is here for the copy brief and the review desk.
      title: { tmdb_id: pick.id, media_type: pick.media_type, title: pick.title },
    },
  };
};
