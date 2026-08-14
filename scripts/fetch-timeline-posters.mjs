// Resolves marketing-site timeline posters via TMDB search (never hardcoded IDs)
// and writes them to apps/website/images/timeline/ as the 280px-wide webp files
// apps/website/index.html consumes (timeline strip, hero collage, Discover
// mockup, collection previews).
//
// Usage — from the repo root:
//   node --env-file=.env scripts/fetch-timeline-posters.mjs            # write
//   node --env-file=.env scripts/fetch-timeline-posters.mjs --dry-run  # report only
//   node --env-file=.env scripts/fetch-timeline-posters.mjs --force    # re-encode all
//
// Several titles here are unreleased, and TMDB swaps their poster art as
// marketing materials land. Every run reports new / replaced / unchanged per
// file so a re-run can't quietly restyle the page; --dry-run previews that
// without touching the working tree.
//
// "Unchanged" is decided by the poster_path recorded in posters.json, not by
// comparing bytes: TMDB serves several encodings of the same artwork from the
// same path (the same poster came back as 52KB and 67KB minutes apart), so
// byte-equality reports phantom changes. Use --force after changing the encode
// settings below, since matching poster_paths otherwise skip the download.
//
// Talks to api.themoviedb.org directly, like every other server-side script
// here. The tmdb-proxy Edge Function is not an option: it only answers requests
// carrying TMDB_PROXY_SHARED_SECRET, which the Cloudflare Worker adds as the
// admission-control boundary for browser traffic.
import { access, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
const IMG = 'https://image.tmdb.org/t/p/w342'; // downscaled to POSTER_WIDTH below
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'website', 'images', 'timeline');
const MANIFEST = path.join(OUT_DIR, 'posters.json');
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');

// Matches the posters already committed: 280 wide, height left to the source
// aspect ratio (most are 2:3, a couple aren't).
const POSTER_WIDTH = 280;
const WEBP_QUALITY = 75;
const WEBP_EFFORT = 6; // slower encode, ~4% smaller than the default 4

// One entry per file referenced by apps/website/index.html. `query` must be the
// exact TMDB title: pickMatch matches on it before falling back to popularity.
const WANTED = [
  { query: 'Oppenheimer',                    type: 'movie', year: 2023, file: 'oppenheimer.webp' },
  { query: 'The Bear',                       type: 'tv',    year: 2022, file: 'the-bear.webp' },
  { query: 'Past Lives',                     type: 'movie', year: 2023, file: 'past-lives.webp' },
  { query: 'The Substance',                  type: 'movie', year: 2024, file: 'the-substance.webp' },
  { query: 'Babygirl',                       type: 'movie', year: 2024, file: 'babygirl.webp' },
  { query: 'Severance',                      type: 'tv',    year: 2022, file: 'severance.webp' },
  { query: 'Sinners',                        type: 'movie', year: 2025, file: 'sinners.webp' },
  { query: 'Saltburn',                       type: 'movie', year: 2023, file: 'saltburn.webp' },
  { query: 'Adolescence',                    type: 'tv',    year: 2025, file: 'adolescence.webp' },
  { query: 'Presumed Innocent',              type: 'tv',    year: 2024, file: 'presumed-innocent.webp' },
  { query: 'Top Gun: Maverick',              type: 'movie', year: 2022, file: 'top-gun-maverick.webp' },
  { query: 'A Knight of the Seven Kingdoms', type: 'tv',    year: 2026, file: 'a-knight-of-the-seven-kingdoms.webp' },
  { query: 'Project Hail Mary',              type: 'movie', year: 2026, file: 'project-hail-mary.webp' },
  { query: 'The Devil Wears Prada 2',        type: 'movie', year: 2026, file: 'the-devil-wears-prada-2.webp' },
  { query: 'The Odyssey',                    type: 'movie', year: 2026, file: 'the-odyssey.webp' },
];

async function search(query) {
  const url = new URL(`${BASE}/search/multi`);
  url.searchParams.set('query', query);
  url.searchParams.set('language', 'en-US');
  const headers = {};
  // v4 read tokens are JWTs (Bearer header); v3 keys go in the query string.
  if (TMDB_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${TMDB_KEY}`;
  else url.searchParams.set('api_key', TMDB_KEY);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Search failed for "${query}": ${res.status}`);
  return (await res.json()).results || [];
}

function pickMatch(results, { query, type, year }) {
  const candidates = results.filter(r =>
    r.media_type === type &&
    r.poster_path &&
    (r.title || r.name || '').toLowerCase() === query.toLowerCase()
  );
  // Prefer the release year we expect, then popularity
  candidates.sort((a, b) => {
    const ay = (a.release_date || a.first_air_date || '').slice(0, 4);
    const by = (b.release_date || b.first_air_date || '').slice(0, 4);
    const aHit = ay === String(year) ? 1 : 0;
    const bHit = by === String(year) ? 1 : 0;
    return bHit - aHit || b.popularity - a.popularity;
  });
  return candidates[0] || results.find(r => r.media_type === type && r.poster_path) || null;
}

const onDisk = (file) => access(path.join(OUT_DIR, file)).then(() => true, () => false);
const readManifest = () => readFile(MANIFEST, 'utf8').then(JSON.parse).catch(() => ({}));

if (!TMDB_KEY) {
  console.error('TMDB_API_KEY is not set. Run from the repo root: node --env-file=.env scripts/fetch-timeline-posters.mjs');
  process.exit(1);
}

const previous = await readManifest();
const manifest = {};
const counts = { new: 0, replaced: 0, unchanged: 0 };

for (const wanted of WANTED) {
  const results = await search(wanted.query);
  const match = pickMatch(results, wanted);
  if (!match) {
    console.error(`NO MATCH: ${wanted.query}`);
    process.exitCode = 1;
    // Keep the old record, so one failed lookup can't drop a file from the
    // manifest and make the next run report it as new.
    if (previous[wanted.file]) manifest[wanted.file] = previous[wanted.file];
    continue;
  }

  const title = match.title || match.name;
  const date = match.release_date || match.first_air_date || '????';
  manifest[wanted.file] = {
    tmdb_id: match.id,
    media_type: wanted.type,
    title,
    release_date: date,
    poster_path: match.poster_path,
  };

  const was = previous[wanted.file];
  const state = !was || !(await onDisk(wanted.file)) ? 'new'
    : was.poster_path === match.poster_path ? 'unchanged'
    : 'replaced';
  counts[state]++;

  if (state === 'unchanged' && !FORCE) {
    console.log(`${'unchanged'.padEnd(10)} ${wanted.file.padEnd(38)} <- ${title} (${date})`);
    continue;
  }

  const imgRes = await fetch(IMG + match.poster_path);
  if (!imgRes.ok) throw new Error(`Image download failed for ${title}: ${imgRes.status}`);
  const webp = await sharp(Buffer.from(await imgRes.arrayBuffer()))
    .resize({ width: POSTER_WIDTH })
    .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
    .toBuffer();
  if (!DRY_RUN) await writeFile(path.join(OUT_DIR, wanted.file), webp);

  const label = state === 'unchanged' ? 're-encoded' : state;
  console.log(`${label.padEnd(10)} ${wanted.file.padEnd(38)} <- ${title} (${date}) ${(webp.length / 1024).toFixed(0)}KB`);
}

if (!DRY_RUN) await writeFile(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

const summary = `${counts.new} new, ${counts.replaced} replaced, ${counts.unchanged} unchanged`;
console.log(DRY_RUN ? `\n${summary} (--dry-run: nothing written)` : `\n${summary}`);
