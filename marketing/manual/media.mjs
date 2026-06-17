// Manual flow — media step for the social-only post types.
//   node marketing/manual/media.mjs [YYYY-MM-DD]
//
// Renders cards for the posts that aren't feed-eligible, using the Card block
// the agent filled in <date>.md:
//   card: 'title'    -> feature card for that title (resolved via TMDB search)
//   card: 'question' -> typographic question card of that text
// Run after writing the copy doc; feed posts already got their media at build.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmdb } from '../lib/tmdb.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { slugify } from '../lib/feed.mjs';
import { nextPublishAt, isoDate } from '../lib/dates.mjs';
import { parse } from './format.mjs';
import { TYPES } from './schedule.mjs';
import { featureData, questionData } from './cards.mjs';

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

  const social = posts.filter(p => !p.meta.feed && TYPES[p.meta.post_type]?.card);
  if (!social.length) { console.log('No social-only posts to render for this date.'); return; }

  let rendered = 0;
  for (const p of social) {
    const info = TYPES[p.meta.post_type];
    const cardText = (p.copy.card || '').trim();
    if (!cardText) { console.log(`skip ${p.meta.post_type}: Card block is empty`); continue; }

    if (info.card === 'title') {
      const res = await tmdb.search(cardText);
      const hit = (res?.results || []).find(r =>
        (r.media_type === 'movie' || r.media_type === 'tv') && (r.backdrop_path || r.poster_path));
      if (!hit) { console.log(`skip ${p.meta.post_type}: no TMDB match for "${cardText}"`); continue; }
      await renderBoth(outDir, 'feature', await featureData(info.kicker, hit), slugify(hit.title || hit.name));
      console.log(`${p.meta.post_type} · ${hit.title || hit.name}`);
    } else {
      await renderBoth(outDir, 'question', questionData(info.kicker, cardText), slugify(info.label));
      console.log(`${p.meta.post_type} · "${cardText.slice(0, 60)}${cardText.length > 60 ? '…' : ''}"`);
    }
    rendered++;
  }
  await closeBrowser();
  console.log(`\nRendered ${rendered} social-only card set(s) → ${path.relative(process.cwd(), outDir)}/`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
