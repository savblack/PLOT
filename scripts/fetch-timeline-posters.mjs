// Resolves marketing-site timeline posters via TMDB search (never hardcoded IDs)
// and downloads them to website/images/timeline/.
// Usage: node scripts/fetch-timeline-posters.mjs
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const PROXY = 'https://mkegtssedjyqldysvzga.supabase.co/functions/v1/tmdb-proxy';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rZWd0c3NlZGp5cWxkeXN2emdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2MDgzMzUsImV4cCI6MjA4OTE4NDMzNX0.W-toEr3ftNeN0iTpRQ8Ord09sxBiwO2CQC6j2jszN6w';
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
  const url = `${PROXY}?path=${encodeURIComponent('search/multi')}&query=${encodeURIComponent(query)}&language=en-US`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${ANON_KEY}` } });
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
