// Ingest Netflix's OFFICIAL weekly Top 10 into the platform_charts table.
//
// Why this exists: the Discover page's per-platform lists are otherwise built
// from TMDB popularity filtered by watch provider, which is a proxy, not a real
// chart. Netflix is the only platform that publishes a genuine Top 10, as a
// free public TSV at top10.netflix.com. This script pulls the latest week,
// resolves each title to a TMDB id at runtime (never hardcoded — see CLAUDE.md),
// and upserts it so the app can show Netflix's actual chart per region.
//
// Source feed (no key, no cost):
//   https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv
//   columns: country_name, country_iso2, week, category, weekly_rank,
//            show_title, season_title, cumulative_weeks_in_top_10
//   category is "Films" or "TV"; week is the Sunday date (e.g. 2026-06-07).
//
// Usage (needs deps):
//   SUPABASE_SERVICE_KEY=… TMDB_API_KEY=… node scripts/sync-netflix-top10.mjs
//   …                                     node scripts/sync-netflix-top10.mjs --dry-run
// In CI these come from GitHub secrets (see .github/workflows/netflix-top10.yml).

import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');

const FEED_URL = 'https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv';
const PLATFORM = 'netflix';
const TMDB_KEY = process.env.TMDB_API_KEY;

const DEFAULT_SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!TMDB_KEY) {
  console.error('TMDB_API_KEY is required.');
  process.exit(1);
}
if (!DRY_RUN && !SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is required unless --dry-run.');
  process.exit(1);
}

const mediaTypeFor = (category) => (category === 'TV' ? 'tv' : category === 'Films' ? 'movie' : null);

function parseTsv(text) {
  const lines = text.split('\n').filter(Boolean);
  const header = lines.shift().split('\t');
  const idx = Object.fromEntries(header.map((name, i) => [name.trim(), i]));
  return lines.map(line => {
    const cols = line.split('\t');
    return {
      region: cols[idx.country_iso2]?.trim(),
      week: cols[idx.week]?.trim(),
      category: cols[idx.category]?.trim(),
      rank: Number(cols[idx.weekly_rank]),
      title: cols[idx.show_title]?.trim(),
      cumulative_weeks: Number(cols[idx.cumulative_weeks_in_top_10]) || null,
    };
  });
}

// Resolve a Netflix title to a TMDB record. We know the media type from the
// Netflix category, so we query the typed search endpoint (more accurate than
// /search/multi) and take the most popular match.
async function resolveTmdb(title, mediaType) {
  const url = new URL(`https://api.themoviedb.org/3/search/${mediaType}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  url.searchParams.set('query', title);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const results = (data.results || []).sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  const match = results[0];
  if (!match) return null;
  return {
    tmdb_id: match.id,
    tmdb_title: match.title || match.name || null,
    poster_path: match.poster_path || null,
  };
}

// Resolve many (title, mediaType) pairs with a small concurrency cap, caching
// by key so a title that charts in many countries is only looked up once.
async function resolveAll(keys) {
  const cache = new Map();
  const queue = [...keys];
  const CONCURRENCY = 8;
  async function worker() {
    for (;;) {
      const key = queue.shift();
      if (!key) return;
      const [mediaType, title] = key.split('\u001f');
      try {
        cache.set(key, await resolveTmdb(title, mediaType));
      } catch {
        cache.set(key, null);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  return cache;
}

async function main() {
  console.log('Fetching Netflix Top 10 feed…');
  const res = await fetch(FEED_URL);
  if (!res.ok) throw new Error(`Netflix feed fetch failed (${res.status})`);
  const rows = parseTsv(await res.text())
    .filter(r => r.region && r.title && mediaTypeFor(r.category) && Number.isInteger(r.rank));

  const latestWeek = rows.map(r => r.week).sort().at(-1);
  const weekRows = rows
    .filter(r => r.week === latestWeek)
    .map(r => ({ ...r, media_type: mediaTypeFor(r.category) }));

  const regions = new Set(weekRows.map(r => r.region));
  console.log(`Latest week ${latestWeek}: ${weekRows.length} rows across ${regions.size} regions.`);

  const keys = new Set(weekRows.map(r => `${r.media_type}\u001f${r.title}`));
  console.log(`Resolving ${keys.size} distinct titles against TMDB…`);
  const cache = await resolveAll(keys);

  const records = weekRows.map(r => {
    const tmdb = cache.get(`${r.media_type}\u001f${r.title}`);
    return {
      platform: PLATFORM,
      region: r.region,
      media_type: r.media_type,
      rank: r.rank,
      week: r.week,
      title: r.title,
      tmdb_id: tmdb?.tmdb_id ?? null,
      tmdb_title: tmdb?.tmdb_title ?? null,
      poster_path: tmdb?.poster_path ?? null,
      match_state: tmdb?.tmdb_id ? 'matched' : 'unmatched',
      cumulative_weeks: r.cumulative_weeks,
      updated_at: new Date().toISOString(),
    };
  });

  const matched = records.filter(r => r.match_state === 'matched').length;
  console.log(`Built ${records.length} records — ${matched} matched, ${records.length - matched} unmatched.`);

  if (DRY_RUN) {
    const usTv = records
      .filter(r => r.region === 'US' && r.media_type === 'tv')
      .sort((a, b) => a.rank - b.rank);
    console.log('\n--dry-run: US TV Top 10 preview:');
    for (const r of usTv) console.log(`  ${r.rank}. ${r.title} → tmdb ${r.tmdb_id ?? '(no match)'}`);
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Upsert the latest week in chunks.
  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await supabase
      .from('platform_charts')
      .upsert(records.slice(i, i + CHUNK), { onConflict: 'platform,region,media_type,week,rank' });
    if (error) throw error;
  }

  // Drop superseded weeks so the table only holds the current chart.
  const { error: pruneError } = await supabase
    .from('platform_charts')
    .delete()
    .eq('platform', PLATFORM)
    .neq('week', latestWeek);
  if (pruneError) throw pruneError;

  console.log(`Done. Upserted week ${latestWeek} and pruned older weeks.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
