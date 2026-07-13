// Generate representative sample share/OG cards for the design system, using the
// REAL api/og.js card builders (no drift) with REAL TMDB data resolved at runtime
// (never hardcode TMDB ids — see CLAUDE.md). Writes 1200×630 PNGs to public/ds/.
//
//   TMDB_API_KEY=... node scripts/gen-share-samples.mjs
//   (or:  set -a; . ./.env; set +a; node scripts/gen-share-samples.mjs)
//
// Fonts are read from public/fonts/ (the same files api/og.js fetches in prod).
// Output is downscaled JPEG (via macOS `sips`) to keep the shipped assets light.
import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { titleCard, listCard, profileCard } from '../apps/web/api/og.js';
import { loadTitle, posterUrl } from '../apps/web/api/_tmdb.js';
import { tmdb } from '../marketing/lib/tmdb.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(root, 'apps', 'web', 'public', 'ds');

// Fonts: same faces api/og.js loads from /fonts/ in production.
const font = (f) => readFileSync(resolve(root, 'apps', 'web', 'public', 'fonts', f));
const fonts = [
  { name: 'Instrument Serif', data: font('InstrumentSerif-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'DM Sans', data: font('DMSans-Regular.ttf'), weight: 400, style: 'normal' },
  { name: 'DM Sans', data: font('DMSans-Medium.ttf'), weight: 500, style: 'normal' },
];

const write = async (name, resp) => {
  // @vercel/og emits PNG; downscale + JPEG-encode for a light, shippable DS asset.
  const png = resolve(tmpdir(), name.replace(/\.jpg$/, '.png'));
  writeFileSync(png, Buffer.from(await resp.arrayBuffer()));
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '82', '-Z', '1000', png, '--out', resolve(OUT, name)]);
  console.log(`  ✓ ${name} (${(statSync(resolve(OUT, name)).size / 1024).toFixed(0)} kB)`);
};

// Resolve a real, well-known title of the given media type via TMDB search.
async function resolveTitle(query, mediaType) {
  const res = await tmdb.search(query);
  const match = (res?.results || []).find((r) => r.media_type === mediaType && (r.title || r.name));
  if (!match) throw new Error(`No ${mediaType} match for "${query}"`);
  return loadTitle(mediaType, match.id); // exact data shape the live card uses
}

async function main() {
  if (!process.env.TMDB_API_KEY) throw new Error('TMDB_API_KEY not set (needed to resolve sample titles)');
  console.log('Generating share-card samples → public/ds/');

  // 1. Title card — a real film with a strong backdrop.
  const film = await resolveTitle('Dune Part Two', 'movie');
  await write('share-title.jpg', titleCard(film, fonts));

  // 2. List card — a named list with real posters resolved at runtime.
  const listPicks = ['The Bear', 'Severance', 'Shogun', 'Ripley', 'Fallout'];
  const posters = [];
  for (const q of listPicks) {
    const r = await tmdb.search(q);
    const m = (r?.results || []).find((x) => x.media_type === 'tv' && x.poster_path);
    if (m) posters.push(posterUrl(m.poster_path, 'w185'));
  }
  await write('share-list.jpg', listCard({ name: 'Prestige TV to catch up on', owner: 'savwatches', posters }, fonts));

  // 3. Profile card — representative stats + a real backdrop (no avatar dependency).
  const backdropTitle = await resolveTitle('Past Lives', 'movie');
  await write('share-profile.jpg', profileCard({
    username: 'savwatches',
    display_name: 'Savannah',
    avatar_url: null,
    is_premium: true,
    backdrop: backdropTitle.backdrop,
    watchCount: 412,
    reviews: 87,
    followers: 1290,
    avgRating: '3.8',
  }, fonts));

  console.log('Done.');
}

main().catch((e) => { console.error('✗', e.message); process.exit(1); });
