// Resolves marketing-site timeline posters via TMDB search (never hardcoded IDs)
// and downloads them to apps/website/images/timeline/.
//
// Usage — from the repo root (the main checkout, not a worktree: that's where
// the root .env with TMDB_API_KEY lives):
//   node --env-file=.env scripts/fetch-timeline-posters.mjs
//
// Talks to api.themoviedb.org directly, like every other server-side script
// here. The tmdb-proxy Edge Function is not an option: it only answers requests
// carrying TMDB_PROXY_SHARED_SECRET, which the Cloudflare Worker adds as the
// admission-control boundary for browser traffic.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'https://api.themoviedb.org/3';
const TMDB_KEY = process.env.TMDB_API_KEY;
const IMG = 'https://image.tmdb.org/t/p/w342';
const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'website', 'images', 'timeline');

const WANTED = [
  { query: 'Oppenheimer',      type: 'movie', year: 2023, file: 'oppenheimer.jpg' },
  { query: 'The Bear',         type: 'tv',    year: 2022, file: 'the-bear.jpg' },
  { query: 'Past Lives',       type: 'movie', year: 2023, file: 'past-lives.jpg' },
  { query: 'The Substance',    type: 'movie', year: 2024, file: 'the-substance.jpg' },
  { query: 'Babygirl',         type: 'movie', year: 2024, file: 'babygirl.jpg' },
  { query: 'Severance',        type: 'tv',    year: 2022, file: 'severance.jpg' },
  { query: 'Sinners',          type: 'movie', year: 2025, file: 'sinners.jpg' },
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

if (!TMDB_KEY) {
  console.error('TMDB_API_KEY is not set. Run from the repo root: node --env-file=.env scripts/fetch-timeline-posters.mjs');
  process.exit(1);
}

for (const wanted of WANTED) {
  const results = await search(wanted.query);
  const match = pickMatch(results, wanted);
  if (!match) {
    console.error(`NO MATCH: ${wanted.query}`);
    process.exitCode = 1;
    continue;
  }
  const title = match.title || match.name;
  const date = match.release_date || match.first_air_date || '????';
  const imgRes = await fetch(IMG + match.poster_path);
  if (!imgRes.ok) throw new Error(`Image download failed for ${title}: ${imgRes.status}`);
  const out = path.join(OUT_DIR, wanted.file);
  await writeFile(out, Buffer.from(await imgRes.arrayBuffer()));
  console.log(`${wanted.file}  <-  ${title} (${date})  ${match.poster_path}`);
}
