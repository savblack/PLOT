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
// Free tier is 100 requests/day. We make ONE call per (service × region) — omitting
// show_type returns both movies and series — so cost = services(3) × regions. Keep
// regions ~30 or fewer. Override the region set with CHART_REGIONS="us,gb,au".
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

// Our canonical platform key → Streaming Availability service id (Max = "hbo").
const SERVICES = [
  { platform: 'prime', service: 'prime' },
  { platform: 'max',   service: 'hbo'   },
  { platform: 'apple', service: 'apple' },
];
const REGIONS = (process.env.CHART_REGIONS || 'us,gb,au,ca,de,fr,es,it,br,mx,in,jp')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

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
    console.warn(`  top ${service}/${country} -> HTTP ${res.status}`);
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
  const runWeek = new Date().toISOString().slice(0, 10); // these charts are daily; stamp the run date
  const raw = [];

  for (const { platform, service } of SERVICES) {
    for (const region of REGIONS) {
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
    console.log(`Fetched ${platform}: ${raw.filter(r => r.platform === platform).length} rows so far.`);
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
    return;
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  const CHUNK = 500;
  for (let i = 0; i < records.length; i += CHUNK) {
    const { error } = await supabase
      .from('platform_charts')
      .upsert(records.slice(i, i + CHUNK), { onConflict: 'platform,region,media_type,week,rank' });
    if (error) throw error;
  }

  // Drop superseded rows for the platforms we own here (leave Netflix alone).
  for (const { platform } of SERVICES) {
    const { error } = await supabase
      .from('platform_charts')
      .delete()
      .eq('platform', platform)
      .neq('week', runWeek);
    if (error) throw error;
  }

  console.log(`Done. Upserted ${runWeek} for ${SERVICES.map(s => s.platform).join(', ')}.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
