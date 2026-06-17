// Manual flow — build step.
//   node marketing/manual/build.mjs [YYYY-MM-DD] [--countdown="A,B"] [--otd=ID:YEARS]
//
// Renders every selected post's cards (portrait + landscape) into
// plot-posts/<date>/ and writes ONE combined copy doc, <date>.md, with the
// payload facts and empty <copy> blocks. A human/agent then writes the copy
// (never the Anthropic API — see marketing/VOICE.md) and runs publish.mjs.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { feedHeroUrl } from '../lib/images.mjs';
import { slugify } from '../lib/feed.mjs';
import { nextPublishAt, weekdayInTz, isoDate } from '../lib/dates.mjs';
import { selectCandidates } from './select.mjs';
import { serialize } from './format.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plot-posts');

const CTA = {
  countdown: 'track_it', trailer_drop: 'track_it',
  weekly_slate: 'whats_on_tonight', now_streaming: 'whats_on_tonight',
  on_this_day: 'journal_it', trending_chart: 'journal_it',
};

const parseArgs = (argv) => {
  const opts = { countdown: [] };
  let date = null;
  for (const a of argv) {
    if (a.startsWith('--countdown=')) opts.countdown = a.slice(12).split(',').map(s => s.trim()).filter(Boolean);
    else if (a.startsWith('--otd=')) opts.otd = a.slice(6);
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) date = a;
  }
  return { date, opts };
};

const titleOf = (c) => c.payload?.title?.title || c.payload?.titles?.[0]?.title || c.post_type;

const factsFor = (c) => {
  const p = c.payload, t = p.title || {};
  const f = [];
  if (c.post_type === 'countdown') {
    f.push(`When: ${p.when_label} (${p.days_until} days to go) · ${p.kind}`);
    if (t.where) f.push(`Where: ${t.where}`);
    if (t.overview) f.push(`Premise: ${t.overview}`);
  } else if (c.post_type === 'on_this_day') {
    f.push(`Anniversary: ${p.years} years${p.release_year ? ` (released ${p.release_year})` : ''}`);
    if (t.overview) f.push(`Premise: ${t.overview}`);
  } else if (c.post_type === 'now_streaming') {
    if (p.providers?.length) f.push(`Streaming on: ${p.providers.join(', ')}`);
    if (p.from_label) f.push(p.from_label);
  } else if (c.post_type === 'trailer_drop') {
    if (p.when_label) f.push(`Releases: ${p.when_label}`);
    if (p.trailer_url) f.push(`Trailer: ${p.trailer_url}`);
    if (t.overview) f.push(`Premise: ${t.overview}`);
  } else if (c.post_type === 'weekly_slate') {
    f.push(`Titles: ${(p.titles || []).map(x => x.title).join(', ')}`);
  } else if (c.post_type === 'trending_chart') {
    f.push(`Top: ${(p.items || []).slice(0, 5).map((x, i) => `${i + 1}. ${x.title}`).join('  ')}`);
  }
  return f;
};

const main = async () => {
  const { date: argDate, opts } = parseArgs(process.argv.slice(2));
  const publishAt = nextPublishAt();
  const date = argDate || isoDate(publishAt);
  const supabase = getSupabase();
  const { data: tracked } = await supabase.from('marketing_tracked_titles').select('*');
  const ctx = { supabase, publishAt, weekday: weekdayInTz(publishAt), tracked: tracked || [] };

  const candidates = await selectCandidates(ctx, opts);
  if (!candidates.length) { console.error('No candidates selected.'); process.exit(1); }

  const outDir = path.join(ROOT, date);
  await mkdir(outDir, { recursive: true });

  // scheduled_for: group under <date> at noon UTC, but never in the future, and
  // staggered so the first post sorts newest (the feed features the newest).
  const base = Math.min(Date.parse(`${date}T12:00:00Z`), Date.now());

  const posts = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const title = titleOf(c);
    const slug = slugify(title) || c.post_type;
    const spec = POST_TYPES[c.post_type];
    const cards = await spec.cards(c.payload);

    const images = { portrait: [], landscape: [] };
    for (let n = 0; n < cards.length; n++) {
      const suffix = cards.length > 1 ? `-${n}` : '';
      const [portrait, landscape] = await Promise.all([
        renderCard(spec.template, cards[n].data, { size: 'portrait' }),
        renderCard(spec.template, cards[n].data, { size: 'landscape' }),
      ]);
      const pName = `${slug}${suffix}-portrait.jpg`;
      const lName = `${slug}${suffix}-landscape.jpg`;
      await writeFile(path.join(outDir, pName), portrait);
      await writeFile(path.join(outDir, lName), landscape);
      images.portrait.push(pName);
      images.landscape.push(lName);
    }

    posts.push({
      title,
      facts: factsFor(c),
      meta: {
        post_type: c.post_type,
        topic_key: `manual:${c.post_type}:${date}:${slug}`,
        scheduled_for: new Date(base - i * 60000).toISOString(),
        hero_image: feedHeroUrl(c.post_type, c.payload),
        cta_variant: CTA[c.post_type] || 'none',
        tmdb_refs: c.tmdb_refs,
        payload: c.payload,
        images,
      },
    });
    console.log(`rendered ${c.post_type} · ${title} (${images.portrait.length} card${images.portrait.length > 1 ? 's' : ''})`);
  }
  await closeBrowser();

  const docPath = path.join(outDir, `${date}.md`);
  await writeFile(docPath, serialize(date, posts));
  console.log(`\n${posts.length} post(s) → ${path.relative(process.cwd(), outDir)}/`);
  console.log(`Next: write the copy in ${date}.md, then  npm run mkt:manual:publish ${date}`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
