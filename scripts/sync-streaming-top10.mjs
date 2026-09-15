// Ingest the OFFICIAL in-app Top 10s for Prime Video, Max, and Apple TV into the
// platform_charts table, via the Streaming Availability API (Movie of the Night,
// over RapidAPI). These are the platforms — besides Netflix — that publish a real
// Top 10. Netflix is intentionally NOT here: it's covered by the free, unlimited
// Tudum feed (scripts/sync-netflix-top10.mjs), so we don't spend API quota on it.
//
// The API returns each show's tmdbId directly (format "movie/123" / "tv/456"), so
// there's no title search to do; we only fetch TMDB details to get a poster_path
// and canonical title so rows render identically to the Netflix ones.
//
// Free tier is 500 requests/month. We make ONE call per (service × region) — omitting
// show_type returns both movies and series — so cost = services(4) × regions per run.
// Regions are auto-detected from the actual `profiles.region` distribution (see
// detectActiveRegions below) so we never spend quota on markets with zero users.
// Prime, Apple and Disney (`core`) are fetched for every region with a user;
// other platforms only for regions with >= CHART_MIN_USERS (default 3) users,
// so one signup from a new market adds 3 requests per run, not 4. The cron is
// WEEKLY (see .github/workflows/streaming-top10.yml): 4 × regions × ~4.3
// runs/month leaves room for ~29 regions. A daily cadence blew the cap once the
// fifth user region appeared (4 × 7 × 30 = 840) and the charts went dark for the
// rest of the month. Set CHART_REGIONS="us,gb,au" to override detection with a
// fixed list (e.g. to pre-seed a market before real users show up there).
//
// Failure modes are deliberately loud: an empty platform (quota exhausted, API
// down) keeps its previous rows instead of being wiped, and the run exits
// non-zero so the workflow goes red rather than logging "Done".
//
// Usage (needs deps):
//   RAPIDAPI_KEY=… TMDB_API_KEY=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/sync-streaming-top10.mjs
//   RAPIDAPI_KEY=… TMDB_API_KEY=…                            node scripts/sync-streaming-top10.mjs --dry-run

import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');

const API_HOST = 'streaming-availability.p.rapidapi.com';
const API_KEY = process.env.RAPIDAPI_KEY || process.env.STREAMING_AVAILABILITY_API_KEY;
const TMDB_KEY = process.env.TMDB_API_KEY;

const DEFAULT_SUPABASE_URL = 'https://mkegtssedjyqldysvzga.supabase.co';
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

// Fallback when there's no DB access to detect from (e.g. --dry-run with no
// service key) and no CHART_REGIONS override — a broad list so a smoke-test
// run still exercises multiple markets.
const FALLBACK_REGIONS = 'us,gb,au,ca,de,fr,es,it,br,mx,in,jp';

// Our canonical platform key → Streaming Availability service id (Max = "hbo").
// `core: true` platforms are fetched for every region that has any user at all
// (alongside Netflix, which is free). The rest are only fetched for regions with
// at least MIN_USERS users — see detectActiveRegions.
const SERVICES = [
  { platform: 'prime',  service: 'prime',  core: true },
  { platform: 'apple',  service: 'apple',  core: true },
  { platform: 'disney', service: 'disney', core: true },
  { platform: 'max',    service: 'hbo',    core: false },
];

// Non-core platforms need at least this many users in a region before we spend
// quota on it there. Each (platform × region) costs one request per run, and a
// single stray signup from a new market used to add a permanent 4/run to the
// bill (in Sep 2026 four of seven active regions had exactly one user). Core
// platforms ignore this and are fetched wherever anyone is. Override with
// CHART_MIN_USERS=1 to fetch every platform for every market.
const MIN_USERS = Math.max(1, Number(process.env.CHART_MIN_USERS) || 3);

// Reads the regions real users are actually in, straight from `profiles.region`.
// Returns { all, established }: every region with a user, and the subset with
// at least MIN_USERS users. Null when there is nothing to detect from.
async function detectActiveRegions(supabase) {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('region').not('region', 'is', null);
  if (error) {
    console.warn(`Could not auto-detect regions from profiles (${error.message}); using fallback list.`);
    return null;
  }
  const counts = new Map();
  for (const { region } of data) {
    if (!region) continue;
    const key = region.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const all = [...counts.keys()].sort();
  const established = [...counts].filter(([, n]) => n >= MIN_USERS).map(([r]) => r).sort();
  const small = [...counts].filter(([, n]) => n < MIN_USERS).map(([r, n]) => `${r}(${n})`).sort();
  if (small.length) console.log(`Regions under ${MIN_USERS} users get core platforms only: ${small.join(', ')}`);
  return all.length ? { all, established } : null;
}

if (!API_KEY) {
  console.error('RAPIDAPI_KEY is required.');
  process.exit(1);
}
if (!TMDB_KEY) {
  console.error('TMDB_API_KEY is required (used to fetch poster + canonical title).');
  process.exit(1);
}
if (!DRY_RUN && !SERVICE_KEY) {
  console.error('SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY) is required unless --dry-run.');
  process.exit(1);
}

// Name the target project before writing anything. SUPABASE_URL falling through
// to the default means production, so a typo'd override (SUPBASE_URL=…) looks
// exactly like a staging run — this line is the only thing that gives it away.
console.log(
  `Target: ${new URL(SUPABASE_URL).host}`
  + (SUPABASE_URL === DEFAULT_SUPABASE_URL ? ' (production, from default)' : '')
  + (DRY_RUN ? ' — dry run, no writes' : '')
);

// "movie/12345" | "tv/678" → { media_type, id }
function parseTmdbId(tmdbId) {
  const m = /^(movie|tv)\/(\d+)$/.exec(tmdbId || '');
  return m ? { media_type: m[1], id: Number(m[2]) } : null;
}

async function fetchTop(service, country) {
  const url = new URL(`https://${API_HOST}/shows/top`);
  url.searchParams.set('country', country);
  url.searchParams.set('service', service);
  // show_type omitted on purpose: one call returns both movies and series,
  // halving the requests we spend against the free tier.
  const res = await fetch(url, { headers: { 'X-RapidAPI-Key': API_KEY, 'X-RapidAPI-Host': API_HOST } });
  if (!res.ok) {
    // Log the body: a 429 alone hides the difference between a per-second
    // rate limit and "you have exceeded the MONTHLY quota", which is the one
    // that matters here.
    const body = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 300);
    console.warn(`  top ${service}/${country} -> HTTP ${res.status}${body ? `: ${body}` : ''}`);
    return [];
  }
  const data = await res.json();
  // The endpoint returns shows already in rank order; accept a bare array or a
  // wrapped shape defensively.
  return Array.isArray(data) ? data : (data.shows || data.results || []);
}

async function tmdbDetails(mediaType, id) {
  const url = new URL(`https://api.themoviedb.org/3/${mediaType}/${id}`);
  url.searchParams.set('api_key', TMDB_KEY);
  url.searchParams.set('language', 'en-US');
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  return { tmdb_title: d.title || d.name || null, poster_path: d.poster_path || null };
}

async function main() {
  const runWeek = new Date().toISOString().slice(0, 10); // stamp the run date (the cron is weekly)
  const raw = [];
  const emptyPlatforms = [];

  // Created early (even for --dry-run, when a key is available) so region
  // detection and the final upsert share one client.
  const supabase = SERVICE_KEY ? createClient(SUPABASE_URL, SERVICE_KEY) : null;

  // REGIONS: every region we fetch core platforms for. ESTABLISHED: the subset
  // (>= MIN_USERS users) that also gets the non-core platforms. An explicit
  // CHART_REGIONS override, and the fallback list, apply to every platform.
  let REGIONS, ESTABLISHED;
  if (process.env.CHART_REGIONS) {
    REGIONS = ESTABLISHED = process.env.CHART_REGIONS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    console.log(`Using CHART_REGIONS override: ${REGIONS.join(', ')}`);
  } else {
    const detected = await detectActiveRegions(supabase);
    REGIONS = detected?.all || FALLBACK_REGIONS.split(',');
    ESTABLISHED = detected?.established || REGIONS;
    console.log(detected
      ? `Auto-detected active regions from profiles: ${REGIONS.join(', ')}`
      : `No regions detected; using fallback list: ${REGIONS.join(', ')}`);
  }

  for (const { platform, service, core } of SERVICES) {
    const regions = core ? REGIONS : ESTABLISHED;
    if (!regions.length) { console.log(`Fetched ${platform}: skipped, no region qualifies.`); continue; }
    for (const region of regions) {
      // One combined, rank-ordered list per region; split it back into a clean
      // per-type Top 10 using each show's tmdbId media type.
      const shows = await fetchTop(service, region);
      const rankByType = { movie: 0, tv: 0 };
      for (const show of shows) {
        const parsed = parseTmdbId(show.tmdbId);
        if (!parsed || rankByType[parsed.media_type] >= 10) continue;
        rankByType[parsed.media_type] += 1;
        raw.push({
          platform,
          region: region.toUpperCase(),
          media_type: parsed.media_type,
          tmdb_id: parsed.id,
          title: show.title || null,
          rank: rankByType[parsed.media_type],
          week: runWeek,
        });
      }
    }
    const fetched = raw.filter(r => r.platform === platform).length;
    console.log(`Fetched ${platform}: ${fetched} rows.`);
    if (fetched === 0) emptyPlatforms.push(platform);
  }

  // Resolve poster_path + canonical title once per distinct TMDB title.
  const detailCache = new Map();
  for (const r of raw) {
    const key = `${r.media_type}/${r.tmdb_id}`;
    if (!detailCache.has(key)) detailCache.set(key, await tmdbDetails(r.media_type, r.tmdb_id));
  }

  const records = raw.map(r => {
    const d = detailCache.get(`${r.media_type}/${r.tmdb_id}`);
    return {
      platform: r.platform,
      region: r.region,
      media_type: r.media_type,
      rank: r.rank,
      week: r.week,
      title: r.title,
      tmdb_id: r.tmdb_id,
      tmdb_title: d?.tmdb_title ?? r.title,
      poster_path: d?.poster_path ?? null,
      match_state: 'matched',
      cumulative_weeks: null,
      updated_at: new Date().toISOString(),
    };
  });

  console.log(`Built ${records.length} records across ${SERVICES.length} platforms and ${REGIONS.length} regions.`);

  if (DRY_RUN) {
    const sample = records
      .filter(r => r.region === 'US' && r.platform === 'max' && r.media_type === 'tv')
      .sort((a, b) => a.rank - b.rank);
    console.log('\n--dry-run: US Max TV Top 10 preview:');
    for (const r of sample) console.log(`  ${r.rank}. ${r.tmdb_title} (tmdb ${r.tmdb_id})`);
    if (emptyPlatforms.length) throw new Error(`No rows fetched for ${emptyPlatforms.join(', ')}.`);
    return;
  }

  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await supabase
      .from('platform_charts')
      .upsert(records.slice(i, i + CHUNK), { onConflict: 'platform,region,media_type,week,rank' });
    if (error) throw error;
  }

  // Drop superseded rows ONLY for platforms that returned new ones (and leave
  // Netflix alone). A platform that fetched nothing keeps its previous chart:
  // a week of staleness beats a blackout.
  const refreshed = SERVICES.map(s => s.platform).filter(p => !emptyPlatforms.includes(p));
  for (const platform of refreshed) {
    const { error } = await supabase
      .from('platform_charts')
      .delete()
      .eq('platform', platform)
      .neq('week', runWeek);
    if (error) throw error;
  }

  if (refreshed.length) console.log(`Upserted ${runWeek} for ${refreshed.join(', ')}.`);
  if (emptyPlatforms.length) {
    throw new Error(
      `No rows fetched for ${emptyPlatforms.join(', ')} — previous rows kept. `
      + 'Check the HTTP responses above (a monthly-quota 429 is the usual cause).'
    );
  }
  console.log('Done.');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
