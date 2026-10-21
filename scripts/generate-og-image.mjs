// Generates the default share card, 1200×630, for BOTH domains:
//   apps/website/og-image.png      theplot.tv pages
//   apps/web/public/og-image.png   app.theplot.tv bare links, and the fallback
//                                  when the /og card function cannot render
// One design, two outputs, so the cards cannot drift apart again (they had:
// different tagline, different layout, "movie" vs "film").
//
// Design: a tilted wall of real film and TV posters under a dark scrim, with
// the wordmark and tagline on top. Same ink and accent as the rendered title
// and profile cards in supabase/functions/og-card.
//
// Usage: TMDB_API_KEY=… node scripts/generate-og-image.mjs
// Posters are fetched from TMDB at generation time and embedded in the page
// that gets screenshotted, so the PNG is the only artefact committed.
import { chromium } from 'playwright';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { wordmarkSvg } from '../packages/core/wordmark.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTS = [
  path.join(ROOT, 'apps', 'website', 'og-image.png'),
  path.join(ROOT, 'apps', 'web', 'public', 'og-image.png'),
];
const FONTS_DIR = path.join(ROOT, 'apps', 'web', 'public', 'fonts');

// Mixed on purpose: recent and classic, film and series, so the wall reads as
// "everything you've watched" rather than one genre. Order matters: it is laid
// out column by column, so neighbours are chosen to vary in colour.
//
// Titles, not TMDB ids: ids are opaque, and a remembered one silently returns
// the wrong title (AGENTS.md). Each is resolved by search and must match on
// name and year, or the script stops rather than ship the wrong poster.
const TITLES = [
  ['movie', 'Parasite', 2019], ['tv', 'The Bear', 2022], ['movie', 'Dune', 2021], ['movie', 'Past Lives', 2023],
  ['tv', 'Severance', 2022], ['movie', 'Everything Everywhere All at Once', 2022], ['movie', 'Oppenheimer', 2023], ['tv', 'Succession', 2018],
  ['movie', 'Spirited Away', 2001], ['movie', 'Mad Max: Fury Road', 2015], ['tv', 'Breaking Bad', 2008], ['movie', 'Barbie', 2023],
  ['movie', 'Fight Club', 1999], ['movie', 'Whiplash', 2014], ['movie', 'Blade Runner 2049', 2017], ['movie', 'Pulp Fiction', 1994],
  ['movie', 'Aftersun', 2022], ['movie', 'Challengers', 2024], ['movie', 'Inception', 2010], ['tv', 'The Last of Us', 2023],
];

const KEY = process.env.TMDB_API_KEY;
if (!KEY) { console.error('Set TMDB_API_KEY (see .env).'); process.exit(1); }
const isV4 = KEY.startsWith('eyJ');
const tmdb = (route, params) => {
  const url = new URL(`https://api.themoviedb.org/3/${route}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  if (!isV4) url.searchParams.set('api_key', KEY);
  return fetch(url, isV4 ? { headers: { Authorization: `Bearer ${KEY}` } } : undefined).then((r) => r.json());
};

async function poster([type, title, year]) {
  const { results = [] } = await tmdb(`search/${type}`, { query: title });
  const norm = (t) => String(t || '').toLowerCase();
  const hit = results.find((r) => norm(r.title || r.name) === norm(title)
    && String(r.release_date || r.first_air_date || '').startsWith(String(year)) && r.poster_path);
  if (!hit) throw new Error(`No TMDB ${type} match for "${title}" (${year})`);
  console.log(`  ${type} "${hit.title || hit.name}" ${year} -> ${hit.id}`);
  const buf = Buffer.from(await (await fetch(`https://image.tmdb.org/t/p/w342${hit.poster_path}`)).arrayBuffer());
  return `data:image/jpeg;base64,${buf.toString('base64')}`;
}
const posters = await Promise.all(TITLES.map(poster));

// page.setContent() never navigates, so font URLs cannot resolve — embed the
// same files apps/web self-hosts.
const font = (file) => `data:font/ttf;base64,${readFileSync(path.join(FONTS_DIR, file)).toString('base64')}`;

// 9 columns of 4, cycling the 20 posters with a different offset per column so
// no poster sits next to itself. Alternate columns drop by half a poster.
const COLS = 9;
const column = (c) => Array.from({ length: 4 }, (_, r) => posters[(c * 7 + r * 5) % posters.length]);
const wall = Array.from({ length: COLS }, (_, c) =>
  `<div class="col" style="margin-top:${c % 2 ? 118 : 0}px">${column(c).map((src) => `<img src="${src}">`).join('')}</div>`).join('');

const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  @font-face { font-family: 'Gabarito'; src: url(${font('Gabarito-Bold.ttf')}) format('truetype'); font-weight: 700; }
  @font-face { font-family: 'DM Sans'; src: url(${font('DMSans-Medium.ttf')}) format('truetype'); font-weight: 500; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #0c0c0c; position: relative; overflow: hidden; }
  .wall { position: absolute; left: 50%; top: 50%; display: flex; gap: 14px; transform: translate(-50%, -50%) rotate(-9deg) scale(1.08); }
  .col { display: flex; flex-direction: column; gap: 14px; }
  .col img { width: 168px; height: 252px; border-radius: 10px; object-fit: cover; display: block; border: 1px solid rgba(255,255,255,0.1); }
  .scrim { position: absolute; inset: 0;
    background:
      radial-gradient(ellipse 620px 330px at 50% 50%, rgba(12,12,12,0.96) 0%, rgba(12,12,12,0.88) 55%, rgba(12,12,12,0) 100%),
      linear-gradient(180deg, rgba(12,12,12,0.55) 0%, rgba(12,12,12,0.35) 50%, rgba(12,12,12,0.7) 100%); }
  .stack { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .wordmark { color: #fafafa; font-size: 190px; line-height: 1; }
  .rule { margin-top: 38px; width: 72px; height: 6px; border-radius: 3px; background: #F06A88; }
  .tagline { margin-top: 30px; font-family: 'DM Sans', sans-serif; font-weight: 500; font-size: 30px; color: #d9d7ce; white-space: nowrap; }
</style></head><body>
  <div class="wall">${wall}</div>
  <div class="scrim"></div>
  <div class="stack">
    <div class="wordmark">${wordmarkSvg({ style: 'display:block;height:.871em;width:1.568em', label: null })}</div>
    <div class="rule"></div>
    <div class="tagline">Your film &amp; TV companion</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
// A full-colour PNG of this is ~870KB. WhatsApp drops link previews whose image
// is much over 300KB, so quantise to a palette: ~270KB, visually identical on
// this dark, scrimmed artwork.
const shot = await page.screenshot({ type: 'png' });
const small = await sharp(shot).png({ palette: true, quality: 80, effort: 10, dither: 1.0 }).toBuffer();
for (const out of OUTS) {
  writeFileSync(out, small);
  console.log(`Wrote ${path.relative(ROOT, out)} (${Math.round(small.length / 1024)}KB)`);
}
await browser.close();
