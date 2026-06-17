// Manual flow — media step for the feature post types.
//   node marketing/manual/media.mjs [YYYY-MM-DD]
//
// Renders a feature card for each title-based social post (spotlight, hidden
// gem, what to watch tonight) from the title named in its Card block, resolved
// via TMDB search. Text-only posts (questions) have no image. Run after writing
// the copy doc; feed posts already got their media at build.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmdb } from '../lib/tmdb.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { slugify } from '../lib/feed.mjs';
import { nextPublishAt, isoDate } from '../lib/dates.mjs';
import { parse } from './format.mjs';
import { TYPES } from './schedule.mjs';
import { featureData } from './cards.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plot-posts');

const renderBoth = async (outDir, template, data, slug) => {
  const [portrait, landscape] = await Promise.all([
    renderCard(template, data, { size: 'portrait' }),
    renderCard(template, data, { size: 'landscape' }),
  ]);
  await writeFile(path.join(outDir, `${slug}-portrait.jpg`), portrait);
  await writeFile(path.join(outDir, `${slug}-landscape.jpg`), landscape);
};

const main = async () => {
  const date = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || isoDate(nextPublishAt());
  const outDir = path.join(ROOT, date);
  const posts = parse(await readFile(path.join(outDir, `${date}.md`), 'utf8'));

  const features = posts.filter(p => TYPES[p.meta.post_type]?.card === 'title');
  if (!features.length) { console.log('No feature posts to render for this date.'); return; }

  let rendered = 0;
  for (const p of features) {
    const info = TYPES[p.meta.post_type];
    const cardText = (p.copy.card || '').trim();
    if (!cardText) { console.log(`skip ${p.meta.post_type}: Card block is empty`); continue; }

    const res = await tmdb.search(cardText);
    const hit = (res?.results || []).find(r =>
      (r.media_type === 'movie' || r.media_type === 'tv') && (r.backdrop_path || r.poster_path));
    if (!hit) { console.log(`skip ${p.meta.post_type}: no TMDB match for "${cardText}"`); continue; }
    await renderBoth(outDir, 'feature', await featureData(info.kicker, hit), slugify(hit.title || hit.name));
    console.log(`${p.meta.post_type} · ${hit.title || hit.name}`);
    rendered++;
  }
  await closeBrowser();
  console.log(`\nRendered ${rendered} feature card set(s) → ${path.relative(process.cwd(), outDir)}/`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
