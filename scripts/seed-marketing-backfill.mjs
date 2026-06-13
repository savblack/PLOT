// One-time backfill so theplot.tv/whats-on isn't empty before the daily
// marketing automation has had time to build a history.
//
// Inserts 50 marketing_posts dated one per day across the past ~7 weeks, using
// the SAME payload shapes, card renders, and feed slugs as the live pipeline
// (marketing/planner/triggers/*, marketing/lib/*) so the seeded posts are
// indistinguishable from real ones. Titles are resolved from TMDB at runtime
// (never hardcoded — see CLAUDE.md); copy is hand-written here per VOICE.md.
//
// The feed shows a post when: slug is set, status is published, and
// scheduled_for <= now() (marketing-feed/index.ts). Backdating = past
// scheduled_for. We only render card 0 / landscape — the single image the feed
// uses as the hero — since these never go to social carousels.
//
// Usage (needs deps + a chromium browser: `npx playwright install chromium`):
//   SUPABASE_SERVICE_KEY=… TMDB_API_KEY=… node scripts/seed-marketing-backfill.mjs --dry-run
//   SUPABASE_SERVICE_KEY=… TMDB_API_KEY=… node scripts/seed-marketing-backfill.mjs --reset
//   SUPABASE_SERVICE_KEY=… TMDB_API_KEY=… node scripts/seed-marketing-backfill.mjs
//   node scripts/seed-marketing-backfill.mjs --selftest   (offline copy check, no network)

import { writeFile } from 'node:fs/promises';
// Pure helpers (no external deps) — safe to import at top level for --selftest.
import { isoDate, addDays, daysBetween, formatWeekdayDayMonth, formatWeekRange, formatDayMonth, weekdayInTz } from '../marketing/lib/dates.mjs';
import { postSlug } from '../marketing/lib/feed.mjs';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const RESET = args.has('--reset');
const SELFTEST = args.has('--selftest');

const POST_COUNT = 50;
const ANNIVERSARY_MARKS = [50, 30, 25, 20, 10];
const YEAR_MOVIE_MIN_VOTES = 1500;

// The marketing libs read SUPABASE_URL at import time; default it (like
// scripts/seed-journal.mjs does) so only SUPABASE_SERVICE_KEY + TMDB_API_KEY
// are strictly required. Override by exporting SUPABASE_URL yourself.
const DEFAULT_SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = DEFAULT_SUPABASE_URL;
}

// ── Copy (hand-written, per marketing/VOICE.md) ──────────────────────────────
// Built from the post payload only (facts must come from the data). Sentence
// case, warm and specific, no spoilers, no clickbait, no dashes in page prose,
// one soft CTA. `i` rotates phrasing so 50 posts don't read identically.

const pick = (arr, i) => arr[i % arr.length];
const clampX = (s) => (s.length > 280 ? `${s.slice(0, 277)}…` : s);
const titleTag = (t) => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 24);
const andList = (names) => {
  const a = names.filter(Boolean);
  if (a.length <= 1) return a[0] || '';
  if (a.length === 2) return `${a[0]} and ${a[1]}`;
  return `${a.slice(0, -1).join(', ')}, and ${a[a.length - 1]}`;
};

const COPY = {
  countdown: (p, i) => {
    const t = p.title.title;
    const when = p.when_label;
    const days = p.days_until;
    const unit = days === 1 ? 'day' : 'days';
    return {
      page_title: pick([`${t} is almost here`, `The countdown to ${t} is on`, `${days} ${unit} until ${t}`], i),
      page_body: [
        `${t} arrives ${when}. The wait is nearly over.`,
        `If it has been sitting on your radar, now is a good moment to add it to your watchlist so the release does not slip past you.`,
      ],
      x: clampX(`${t} lands ${when}. ${days} ${unit} to go. Track it on PLOT, link in bio.`),
      instagram: `${t} lands ${when}. ${days} ${unit} and counting.\n\nSave it to your watchlist so you do not miss opening night.\n\n#${titleTag(t)} #comingsoon #watchlist #filmtwitter`,
      threads: `${days} ${unit} until ${t}. Anyone else already clearing their schedule for ${when.split(' ').slice(0, 2).join(' ')}?`,
      hashtags: [titleTag(t), 'comingsoon', 'watchlist', 'filmtwitter'],
      alt_text: `A countdown card for ${t} showing ${days} ${unit} to go.`,
      cta_variant: 'track_it',
    };
  },

  now_streaming: (p, i) => {
    const t = p.title.title;
    const where = (p.providers || []).slice(0, 2);
    const whereStr = where.length ? ` It is streaming now on ${andList(where)}.` : '';
    const from = p.from_label ? ` ${p.from_label}.` : '';
    return {
      page_title: pick([`${t} is now streaming`, `${t} has come home`, `Watch ${t} at home tonight`], i),
      page_body: [
        `${t} has landed at home.${whereStr}`,
        `If you missed it on the big screen, tonight is your night.${from}`,
      ],
      x: clampX(`${t} is now streaming.${whereStr} A good one for tonight. What's on at theplot.tv.`),
      instagram: `${t} is streaming now.${whereStr}\n\nThe perfect kind of night in.\n\n#${titleTag(t)} #nowstreaming #whattowatch #movienight`,
      threads: `${t} just hit streaming. Adding it to tonight's shortlist.`,
      hashtags: [titleTag(t), 'nowstreaming', 'whattowatch', 'movienight'],
      alt_text: `A now streaming card for ${t}.`,
      cta_variant: 'whats_on_tonight',
    };
  },

  trailer_drop: (p, i) => {
    const t = p.title.title;
    const when = p.when_label ? ` It arrives ${p.when_label}.` : '';
    return {
      page_title: pick([`A first look at ${t}`, `The ${t} trailer is here`, `First look: ${t}`], i),
      page_body: [
        `The first official trailer for ${t} has arrived.${when}`,
        `Worth two minutes of your day if it is the kind of thing you have been waiting for.`,
      ],
      x: clampX(`The first trailer for ${t} just dropped.${when} Track it on PLOT, link in bio.`),
      instagram: `First look at ${t}.${when}\n\nThe trailer is live. Consider this your heads up.\n\n#${titleTag(t)} #trailer #firstlook #comingsoon`,
      threads: `New ${t} trailer just landed. Cautiously very excited.`,
      hashtags: [titleTag(t), 'trailer', 'firstlook', 'comingsoon'],
      alt_text: `A new trailer card for ${t}.`,
      cta_variant: 'track_it',
    };
  },

  on_this_day: (p, i) => {
    const t = p.title.title;
    const years = p.years;
    return {
      page_title: pick([`${years} years of ${t}`, `On this day: ${t}`, `${t}, ${years} years on`], i),
      page_body: [
        `${t} arrived ${years} years ago today.`,
        `Some films only get better with distance. If it has been a while, this feels like a fine excuse for a rewatch.`,
      ],
      x: clampX(`${years} years ago today: ${t}. Seen it? Log it in your journal on PLOT.`),
      instagram: `${years} years of ${t}.\n\nStill worth your evening. Seen it lately?\n\n#${titleTag(t)} #onthisday #rewatch #filmtwitter`,
      threads: `${t} is ${years} years old today. Where does the time go.`,
      hashtags: [titleTag(t), 'onthisday', 'rewatch', 'filmtwitter'],
      alt_text: `An on this day card for ${t}, ${years} years on.`,
      cta_variant: 'journal_it',
    };
  },

  weekly_slate: (p, i) => {
    const names = (p.titles || []).map((t) => t.title);
    const lead = names.slice(0, 3);
    // week_label is rendered with an en dash ("8 – 14 June"); page prose stays dash-free.
    const weekProse = String(p.week_label || '').replace(/\s[–—-]\s/g, ' to ');
    return {
      page_title: pick([`The week ahead`, `What is coming this week`, `Your week in film and television`], i),
      page_body: [
        `A look at what is landing between ${weekProse}.`,
        lead.length ? `Highlights include ${andList(lead)}.` : `A handful of releases worth keeping an eye on.`,
        `Pick a couple, add them to your watchlist, and you are set for the week.`,
      ],
      x: clampX(`This week: ${andList(lead)}${names.length > 3 ? ', and more' : ''}. Find what's on at theplot.tv.`),
      instagram: `Coming this week.\n\n${andList(lead)}${names.length > 3 ? ', plus more' : ''}, all landing ${p.week_label}.\n\n#whatson #comingsoon #watchlist #newreleases`,
      threads: `The week ahead: ${andList(lead)}. What is everyone planning to watch?`,
      hashtags: ['whatson', 'comingsoon', 'watchlist', 'newreleases'],
      alt_text: `A weekly slate card for ${names[0] || 'this week'}.`,
      cta_variant: 'whats_on_tonight',
    };
  },

  trending_chart: (p, i) => {
    const items = p.items || [];
    const top = items[0]?.title;
    const climber = items.find((it) => it.movement?.dir === 'up');
    const fresh = items.find((it) => it.movement?.dir === 'new');
    const note = fresh
      ? `${fresh.title} is new on the chart this week.`
      : climber
        ? `${climber.title} is climbing fast.`
        : `The top of the chart is holding steady.`;
    return {
      page_title: pick([`This week's trending chart`, `What everyone is watching`, `The chart, ${formatLabelOnly(p.week_label)}`], i),
      page_body: [
        `${top ? `${top} sits at the top of this week's chart.` : `Here is what everyone is watching this week.`}`,
        note,
        `The full top ten is on the card. Seen any of them? Log them in your journal.`,
      ],
      x: clampX(`${top} tops this week's trending chart. ${note} See the full top ten on PLOT.`),
      instagram: `This week's trending top ten.\n\n${top ? `${top} leads the pack. ` : ''}${note}\n\n#trending #whatson #watchlist #filmtwitter`,
      threads: `${top} is number one this week. ${note}`,
      hashtags: ['trending', 'whatson', 'watchlist', 'filmtwitter'],
      alt_text: `A trending chart card led by ${top || 'this week\'s top title'}.`,
      cta_variant: 'journal_it',
    };
  },
};

const formatLabelOnly = (weekLabel) => String(weekLabel || '').replace(/^week of\s+/i, '');

const buildCopy = (postType, payload, i) => COPY[postType](payload, i);

// ── Offline self-test of the copy builders (no network, no deps) ─────────────
const runSelfTest = () => {
  const synthetic = {
    countdown: { days_until: 7, kind: 'cinema', when_label: 'Friday 12 June', title: { title: 'The Quiet Year' } },
    now_streaming: { providers: ['Netflix', 'Max'], from_label: 'In cinemas since 1 May', title: { title: 'The Quiet Year' } },
    trailer_drop: { kind: 'cinema', when_label: 'Friday 12 June', title: { title: 'The Quiet Year' } },
    on_this_day: { years: 25, release_year: 2001, title: { title: 'The Quiet Year' } },
    weekly_slate: { week_label: '8 – 14 June', titles: [{ title: 'Alpha' }, { title: 'Beta' }, { title: 'Gamma' }, { title: 'Delta' }] },
    trending_chart: {
      week_label: 'Week of 12 June',
      items: [
        { rank: 1, title: 'Alpha', media_type: 'movie', movement: { dir: 'same' } },
        { rank: 2, title: 'Beta', media_type: 'tv', movement: { dir: 'new' } },
        { rank: 3, title: 'Gamma', media_type: 'movie', movement: { dir: 'up', delta: 2 } },
      ],
    },
  };

  let failures = 0;
  const fail = (msg) => { console.error(`  ✗ ${msg}`); failures++; };
  // A made-up, dash-free title so any dash we find came from our own prose.
  for (const [type, payload] of Object.entries(synthetic)) {
    for (let i = 0; i < 3; i++) {
      const c = buildCopy(type, payload, i);
      const required = ['x', 'instagram', 'threads', 'hashtags', 'alt_text', 'cta_variant', 'page_title', 'page_body'];
      for (const k of required) if (c[k] == null) fail(`${type}#${i}: missing ${k}`);
      if (!Array.isArray(c.page_body) || c.page_body.length < 2) fail(`${type}#${i}: page_body needs 2+ paragraphs`);
      if (c.x.length > 280) fail(`${type}#${i}: X copy ${c.x.length} > 280`);
      if (/https?:\/\/|www\./i.test(c.x) || /https?:\/\/|www\./i.test(c.threads)) fail(`${type}#${i}: X/Threads contains a URL`);
      if (/#/.test(c.x) || /#/.test(c.threads)) fail(`${type}#${i}: hashtags not allowed on X/Threads`);
      const pageProse = [c.page_title, ...c.page_body].join(' ');
      if (/[—–]|(\s-\s)/.test(pageProse)) fail(`${type}#${i}: dash in page prose`);
      if (!['track_it', 'whats_on_tonight', 'journal_it', 'none'].includes(c.cta_variant)) fail(`${type}#${i}: bad cta_variant`);
      if (c.hashtags.length < 3 || c.hashtags.length > 5) fail(`${type}#${i}: want 3-5 hashtags`);
    }
  }
  if (failures) {
    console.error(`\nSelf-test FAILED with ${failures} issue(s).`);
    process.exit(1);
  }
  console.log('Self-test passed: copy builders satisfy VOICE.md constraints for all 6 post types.');
};

// ── Planning: assign a post type to each backdated day ───────────────────────
// Monday -> weekly_slate, Friday -> trending_chart (the planner's anchors);
// every other day cycles the priority-ladder types for a realistic mix.
const NON_ANCHOR_CYCLE = [
  { type: 'countdown', days: 7 },
  { type: 'now_streaming' },
  { type: 'trailer_drop' },
  { type: 'on_this_day' },
  { type: 'countdown', days: 14 },
  { type: 'now_streaming' },
  { type: 'trailer_drop' },
  { type: 'on_this_day' },
  { type: 'countdown', days: 1 },
];

const buildSchedule = (now) => {
  // 50 days, one per day, noon UTC, ending yesterday (newest strictly < now).
  const startOfToday = new Date(now);
  startOfToday.setUTCHours(12, 0, 0, 0);
  const days = [];
  for (let i = POST_COUNT; i >= 1; i--) {
    const d = new Date(startOfToday);
    d.setUTCDate(d.getUTCDate() - i);
    days.push(d);
  }
  let cycleIdx = 0;
  return days.map((date) => {
    const weekday = weekdayInTz(date);
    if (weekday === 'Monday') return { date, plan: { type: 'weekly_slate' } };
    if (weekday === 'Friday') return { date, plan: { type: 'trending_chart' } };
    return { date, plan: NON_ANCHOR_CYCLE[cycleIdx++ % NON_ANCHOR_CYCLE.length] };
  });
};

// ── TMDB sourcing helpers ────────────────────────────────────────────────────
const slimTitle = (item, extra = {}) => ({
  tmdb_id: item.id,
  media_type: item.media_type,
  title: item.title || item.name,
  overview: item.overview || null,
  poster_path: item.poster_path || null,
  backdrop_path: item.backdrop_path || null,
  ...extra,
});

const refOf = (t) => ({ media_type: t.media_type, id: t.tmdb_id, title: t.title });

// Films released exactly `years` before `dateObj` (anniversary relative to the
// backdated day, not real today), most-voted first.
const anniversariesForDate = async (fetchTMDB, dateObj, years, minVotes) => {
  const target = new Date(dateObj);
  target.setUTCFullYear(target.getUTCFullYear() - years);
  const day = isoDate(target);
  const data = await fetchTMDB('/discover/movie', {
    'primary_release_date.gte': day,
    'primary_release_date.lte': day,
    'vote_count.gte': String(minVotes),
    sort_by: 'vote_count.desc',
  }).catch(() => null);
  return (data?.results || []).filter((m) => m.poster_path).map((m) => ({ ...m, media_type: 'movie' }));
};

// Deterministic per-week rotation of the trending pool so successive backdated
// charts differ and week-over-week movement labels populate.
const movementFor = (item, rank, prior) => {
  if (!prior) return { dir: 'none' };
  const prev = prior.find((p) => p.tmdb_id === item.tmdb_id && p.media_type === item.media_type);
  if (!prev) return { dir: 'new' };
  if (prev.rank === rank) return { dir: 'same' };
  return prev.rank > rank ? { dir: 'up', delta: prev.rank - rank } : { dir: 'down', delta: rank - prev.rank };
};
const movementLabel = (m, rank) => {
  if (m.dir === 'new') return 'New on the chart this week';
  if (m.dir === 'same') return rank === 1 ? 'Holding the top spot' : 'Holding steady';
  if (m.dir === 'up') return `Up ${m.delta} this week`;
  if (m.dir === 'down') return `Down ${m.delta} this week`;
  return null;
};

// ── Payload builders (mirror marketing/planner/triggers/* shapes) ────────────
const makePayloadBuilder = (tmdb, fetchTMDB) => {
  // Shared pools, fetched once.
  let pools = null;
  const loadPools = async () => {
    if (pools) return pools;
    const today = isoDate(new Date());
    const digitalSince = addDays(today, -150);
    const [trending, upMovies, upTV, recentDigitalRaw] = await Promise.all([
      tmdb.getTrending('all', 'week'),
      tmdb.getUpcomingMovies(240),
      tmdb.getUpcomingTV(240),
      // Real films that hit digital in the last ~5 months (for "now streaming").
      fetchTMDB('/discover/movie', {
        with_release_type: '4',
        'release_date.gte': digitalSince,
        'release_date.lte': addDays(today, -1),
        'vote_count.gte': '40',
        sort_by: 'popularity.desc',
      }).catch(() => null),
    ]);
    const trendingClean = trending
      .filter((it) => ['movie', 'tv'].includes(it.media_type) && it.poster_path)
      .slice(0, 14);
    // Drop catalog re-releases: genuinely upcoming titles have very few votes,
    // whereas a re-released classic (Endgame, Moana) carries thousands.
    const upcoming = [...upMovies, ...upTV]
      .filter((it) => it.poster_path && (it.vote_count || 0) < 80 && (it.popularity || 0) >= 5)
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    const recentDigital = (recentDigitalRaw?.results || [])
      .filter((it) => it.poster_path)
      .map((it) => ({ ...it, media_type: 'movie' }))
      .sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    pools = { trendingClean, upcoming, recentDigital };
    return pools;
  };

  const used = new Set();
  const isUsed = (it) => used.has(`${it.media_type}:${it.id}`);
  const markUsed = (it) => used.add(`${it.media_type}:${it.id}`);
  // First unused item matching `ok`; falls back to first match if all are used.
  const takeFrom = (list, ok = () => true) => {
    const fresh = list.find((it) => ok(it) && !isUsed(it));
    const chosen = fresh || list.find(ok);
    if (chosen) markUsed(chosen);
    return chosen || null;
  };

  let priorChart = null; // previous backdated Friday's ranks, for movement
  let chartWeek = 0;

  return {
    loadPools,

    countdown: async ({ date }) => {
      const { upcoming } = await loadPools();
      const day = isoDate(date);
      const relOf = (it) => (it.media_type === 'tv' ? it.first_air_date : it.release_date) || null;
      // Truthful countdown: the title's real release must be ahead of the post
      // date by a countdown-sized gap (so we never fabricate a release date).
      const inWindow = (it) => {
        const rel = relOf(it);
        if (!rel) return false;
        const gap = daysBetween(day, rel);
        return gap >= 2 && gap <= 120;
      };
      const item = takeFrom(upcoming, inWindow);
      if (!item) return null;
      const rel = relOf(item);
      const gap = daysBetween(day, rel);
      return {
        post_type: 'countdown',
        topic_key: `backfill:countdown:${day}`,
        tmdb_refs: [{ media_type: item.media_type, id: item.id, title: item.title || item.name }],
        payload: {
          days_until: gap,
          kind: item.media_type === 'tv' ? 'tv' : 'cinema',
          when_label: formatWeekdayDayMonth(rel),
          title: slimTitle(item),
        },
      };
    },

    now_streaming: async ({ date }) => {
      const { recentDigital } = await loadPools();
      const item = takeFrom(recentDigital);
      if (!item) return null;
      const providers = await tmdb.getWatchProviders('movie', item.id).catch(() => []);
      return {
        post_type: 'now_streaming',
        topic_key: `backfill:now_streaming:${isoDate(date)}`,
        tmdb_refs: [{ media_type: 'movie', id: item.id, title: item.title }],
        payload: {
          providers: providers.slice(0, 3).map((p) => p.provider_name),
          from_label: null,
          title: slimTitle({ ...item, media_type: 'movie' }),
        },
      };
    },

    trailer_drop: async ({ date }) => {
      const { upcoming } = await loadPools();
      // Find a title that actually has an official trailer.
      for (const it of upcoming) {
        if (isUsed(it)) continue;
        const trailers = await tmdb.getTrailers(it.media_type, it.id).catch(() => []);
        if (!trailers.length) continue;
        markUsed(it);
        const rel = (it.media_type === 'tv' ? it.first_air_date : it.release_date) || null;
        return {
          post_type: 'trailer_drop',
          topic_key: `backfill:trailer_drop:${isoDate(date)}`,
          tmdb_refs: [{ media_type: it.media_type, id: it.id, title: it.title || it.name }],
          payload: {
            kind: it.media_type === 'tv' ? 'tv' : 'cinema',
            when_label: rel ? formatWeekdayDayMonth(rel) : null,
            title: slimTitle(it),
          },
        };
      }
      return null;
    },

    on_this_day: async ({ date }, { relaxed = false } = {}) => {
      const marks = relaxed
        ? [50, 45, 40, 35, 30, 28, 25, 22, 20, 18, 15, 12, 10, 8, 6, 5, 4, 3]
        : ANNIVERSARY_MARKS;
      const minVotes = relaxed ? 200 : YEAR_MOVIE_MIN_VOTES;
      for (const years of marks) {
        const results = await anniversariesForDate(fetchTMDB, date, years, minVotes);
        const item = results.find((m) => !isUsed(m)) || results[0];
        if (!item) continue;
        markUsed(item);
        return {
          post_type: 'on_this_day',
          topic_key: `backfill:on_this_day:${isoDate(date)}`,
          tmdb_refs: [{ media_type: 'movie', id: item.id, title: item.title }],
          payload: {
            years,
            release_year: item.release_date ? Number(item.release_date.slice(0, 4)) : null,
            title: slimTitle({ ...item, media_type: 'movie' }),
          },
        };
      }
      return null;
    },

    weekly_slate: async ({ date }) => {
      const from = isoDate(date);
      const to = addDays(from, 6);
      const { theatrical, digital, tv } = await tmdb.getReleasesInWindow(from, to);
      const seen = new Set();
      const pool = [...theatrical, ...digital, ...tv]
        .filter((it) => it.poster_path)
        .filter((it) => (seen.has(`${it.media_type}:${it.id}`) ? false : seen.add(`${it.media_type}:${it.id}`)))
        .sort((a, b) => (b.popularity || 0) - (a.popularity || 0))
        .slice(0, 6);
      if (pool.length < 3) return null;
      const titles = pool.map((it) => {
        const dateStr = it.media_type === 'tv' ? it.first_air_date : it.release_date;
        return slimTitle(it, {
          release_kind: it.release_kind,
          when_label: dateStr ? formatWeekdayDayMonth(dateStr) : null,
          where: null,
          popularity: it.popularity,
        });
      });
      return {
        post_type: 'weekly_slate',
        topic_key: `backfill:weekly_slate:${from}`,
        tmdb_refs: titles.map(refOf),
        payload: { week_label: formatWeekRange(from, to), titles },
      };
    },

    trending_chart: async ({ date }) => {
      const { trendingClean } = await loadPools();
      if (trendingClean.length < 10) return null;
      // Rotate the pool by the chart-week index, then take a top ten.
      const rot = chartWeek % trendingClean.length;
      const rotated = [...trendingClean.slice(rot), ...trendingClean.slice(0, rot)].slice(0, 10);
      const items = rotated.map((it, idx) => {
        const rank = idx + 1;
        const base = { rank, tmdb_id: it.id, media_type: it.media_type, title: it.title || it.name };
        const movement = movementFor(base, rank, priorChart);
        return {
          ...base,
          poster_path: it.poster_path || null,
          backdrop_path: it.backdrop_path || null,
          movement,
          movement_label: movementLabel(movement, rank),
        };
      });
      priorChart = items.map(({ rank, tmdb_id, media_type, title }) => ({ rank, tmdb_id, media_type, title }));
      chartWeek++;
      return {
        post_type: 'trending_chart',
        topic_key: `backfill:trending_chart:${isoDate(date)}`,
        tmdb_refs: items.map((it) => ({ media_type: it.media_type, id: it.tmdb_id, title: it.title })),
        payload: { week_label: `Week of ${formatDayMonth(isoDate(date))}`, items },
      };
    },
  };
};

// ── Main ─────────────────────────────────────────────────────────────────────
const main = async () => {
  if (SELFTEST) { runSelfTest(); return; }

  if (!process.env.TMDB_API_KEY) {
    console.error('Missing TMDB_API_KEY. Run: TMDB_API_KEY=… SUPABASE_SERVICE_KEY=… node scripts/seed-marketing-backfill.mjs');
    process.exit(1);
  }
  if (!DRY_RUN && !process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_KEY) {
    console.error('Missing SUPABASE_SERVICE_KEY (service role). Required for DB writes.');
    process.exit(1);
  }

  // Dynamic import AFTER the SUPABASE_URL fallback is set (libs read it at import).
  const { tmdb, fetchTMDB } = await import('../marketing/lib/tmdb.mjs');
  const { POST_TYPES } = await import('../marketing/lib/post-types.mjs');
  const { feedHeroUrl } = await import('../marketing/lib/images.mjs');

  const now = new Date();
  const schedule = buildSchedule(now);
  const builder = makePayloadBuilder(tmdb, fetchTMDB);

  console.log(`Building ${schedule.length} backdated posts (${isoDate(schedule[0].date)} → ${isoDate(schedule[schedule.length - 1].date)})…`);

  // Build candidates in chronological order (trending movement depends on it).
  const candidates = [];
  for (let i = 0; i < schedule.length; i++) {
    const slot = schedule[i];
    let cand = await builder[slot.plan.type](slot);
    // Fall back to an anniversary if a primary type found nothing fresh,
    // then to a relaxed anniversary so every day gets a post.
    if (!cand && slot.plan.type !== 'on_this_day') cand = await builder.on_this_day(slot);
    if (!cand) cand = await builder.on_this_day(slot, { relaxed: true });
    if (!cand) { console.warn(`  ! ${isoDate(slot.date)} ${slot.plan.type}: no content, skipped`); continue; }
    const copy = buildCopy(cand.post_type, cand.payload, i);
    // Feed/article hero = plain TMDB still (no branding) for every type except
    // trending_chart, which keeps its branded chart render (hero_image = null).
    copy.hero_image = feedHeroUrl(cand.post_type, cand.payload);
    const scheduledFor = slot.date.toISOString();
    candidates.push({ ...cand, copy, scheduledFor, slug: postSlug(copy.page_title, scheduledFor) });
  }

  console.log(`Built ${candidates.length} posts.`);

  if (DRY_RUN) {
    console.log('\n── DRY RUN ──────────────────────────────────────────────');
    for (const c of candidates) {
      console.log(`${c.scheduledFor.slice(0, 10)}  ${c.post_type.padEnd(14)}  ${c.copy.page_title}`);
      console.log(`            slug: ${c.slug}`);
      console.log(`            ${c.copy.page_body[0]}`);
    }
    const counts = candidates.reduce((m, c) => ({ ...m, [c.post_type]: (m[c.post_type] || 0) + 1 }), {});
    console.log('\nType distribution:', counts);
    const slugs = new Set(candidates.map((c) => c.slug));
    console.log(`Unique slugs: ${slugs.size}/${candidates.length}`);

    // Smoke test: render the first post's hero card to a temp file.
    try {
      const { renderCard, closeBrowser } = await import('../marketing/lib/render.mjs');
      const first = candidates[0];
      const cards = await POST_TYPES[first.post_type].cards(first.payload);
      const buf = await renderCard(POST_TYPES[first.post_type].template, cards[0].data, { size: 'landscape' });
      const out = `/tmp/backfill-smoke-${first.post_type}.jpg`;
      await writeFile(out, buf);
      await closeBrowser();
      console.log(`\nRender smoke test OK → ${out} (${(buf.length / 1024).toFixed(0)} KB). Open it to eyeball the card.`);
    } catch (err) {
      console.warn(`\nRender smoke test skipped/failed: ${err.message}`);
      console.warn('(Install a browser with: npx playwright install chromium)');
    }
    console.log('\nDry run complete — no database writes. Re-run without --dry-run to seed.');
    return;
  }

  // ── Live seed ──────────────────────────────────────────────────────────────
  const { getSupabase } = await import('../marketing/lib/supabase.mjs');
  const { uploadMedia } = await import('../marketing/lib/storage.mjs');
  const { renderCard, closeBrowser } = await import('../marketing/lib/render.mjs');
  const supabase = getSupabase();

  if (RESET) {
    const { error } = await supabase.from('marketing_posts').delete().like('topic_key', 'backfill:%');
    if (error) { console.error(`Reset failed: ${error.message}`); process.exit(1); }
    console.log('Reset: removed existing backfill posts.');
  }

  let ok = 0;
  for (const c of candidates) {
    try {
      // 1) Insert the planned row and get its id (needed for the media path).
      const { data: inserted, error: insErr } = await supabase
        .from('marketing_posts')
        .insert({
          post_type: c.post_type,
          topic_key: c.topic_key,
          status: 'planned',
          scheduled_for: c.scheduledFor,
          tmdb_refs: c.tmdb_refs,
          payload: c.payload,
          copy: c.copy,
        })
        .select('id')
        .single();
      if (insErr) {
        if (insErr.code === '23505') { console.log(`  = ${c.slug}: already exists, skipping`); continue; }
        throw new Error(insErr.message);
      }
      const id = inserted.id;

      // 2) Only trending charts get a branded render (their hero IS the chart).
      // Every other type leads with copy.hero_image (plain TMDB), so no render.
      let media = null;
      if (c.post_type === 'trending_chart') {
        const cards = await POST_TYPES[c.post_type].cards(c.payload);
        const buf = await renderCard(POST_TYPES[c.post_type].template, cards[0].data, { size: 'landscape' });
        const landscapePath = await uploadMedia(`${id}/card-0-landscape.jpg`, buf);
        media = [{ portrait_path: null, landscape_path: landscapePath, channels: null }];
      }

      // 3) Publish: set media + slug + status so the feed shows it.
      const { error: updErr } = await supabase
        .from('marketing_posts')
        .update({
          media,
          slug: c.slug,
          status: 'published',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (updErr) throw new Error(updErr.message);

      ok++;
      console.log(`  ✓ ${c.scheduledFor.slice(0, 10)} ${c.post_type} — ${c.slug}`);
    } catch (err) {
      console.error(`  ✗ ${c.scheduledFor.slice(0, 10)} ${c.post_type}: ${err.message}`);
    }
  }

  await closeBrowser();
  console.log(`\nDone. Published ${ok}/${candidates.length} backfill posts to the What's On feed.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
