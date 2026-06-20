// Manual flow — build step.
//   node marketing/manual/build.mjs [YYYY-MM-DD] [--countdown="A,B"] [--otd=ID:YEARS]
//
// With no flags it follows the weekly schedule (marketing/manual/schedule.mjs)
// for the run date's weekday. Renderable posts get their cards (portrait +
// landscape) written into plot-posts/<date>/; copy-only posts (spotlight,
// questions, ...) get a section with no image. Everything lands in one combined
// copy doc, <date>.md, with empty <copy> blocks for a human/agent to fill
// (never the Anthropic API — see marketing/VOICE.md). Then run publish.mjs.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { renderCard, closeBrowser } from '../lib/render.mjs';
import { POST_TYPES } from '../lib/post-types.mjs';
import { feedHeroUrl } from '../lib/images.mjs';
import { slugify } from '../lib/feed.mjs';
import { nextPublishAt, isoDate } from '../lib/dates.mjs';
import { selectCandidates } from './select.mjs';
import { serialize } from './format.mjs';
import { TYPES, CTA, SCHEDULE, weekdayOf } from './schedule.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plot-posts');

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

const titleOf = (c) =>
  c.payload?.title?.title || c.payload?.titles?.[0]?.title || TYPES[c.post_type]?.label || c.post_type;

const factsFor = (c) => {
  const p = c.payload || {}, t = p.title || {};
  const f = [];
  if (c.copyOnly) {
    if (c.post_type === 'spotlight') f.push('Put the US title to spotlight in the Card block, then: npm run mkt:manual:media -- <date>');
    else if (c.post_type === 'hidden_gem') f.push('Put the under-seen US title in the Card block, then: npm run mkt:manual:media -- <date>');
    else if (c.post_type === 'what_to_watch_tonight') f.push('Put the US title to recommend tonight in the Card block, then: npm run mkt:manual:media -- <date>');
    else if (c.post_type === 'text_question') f.push('Text-only post (no image): write one short question for the audience.');
    else if (c.post_type === 'question_of_week') f.push('Text-only post (no image): write the question of the week.');
    return f;
  }
  if (c.post_type === 'countdown') {
    f.push(`When: ${p.when_label} (${p.days_until} days to go) · ${p.kind}`);
    if (t.where) f.push(`Where: ${t.where}`);
    if (t.overview) f.push(`Premise: ${t.overview}`);
  } else if (c.post_type === 'on_this_day') {
    f.push(`Anniversary: ${p.years} years${p.release_year ? ` (released ${p.release_year})` : ''}`);
    if (t.overview) f.push(`Premise: ${t.overview}`);
  } else if (c.post_type === 'upcoming') {
    f.push(`Titles: ${(p.titles || []).map(x => x.title).join(', ')}`);
  } else if (c.post_type === 'trending') {
    f.push(`Top: ${(p.items || []).slice(0, 5).map((x, i) => `${i + 1}. ${x.title}`).join('  ')}`);
  }
  return f;
};

const main = async () => {
  const { date: argDate, opts } = parseArgs(process.argv.slice(2));
  const publishAt = nextPublishAt();
  const date = argDate || isoDate(publishAt);
  const weekday = weekdayOf(date);
  const supabase = getSupabase();
  const { data: tracked } = await supabase.from('marketing_tracked_titles').select('*');
  const ctx = { supabase, publishAt, today: date, weekday, tracked: tracked || [] };

  console.log(`${date} (${weekday}) — schedule: ${(SCHEDULE[weekday] || []).join(', ') || '(none)'}`);
  const candidates = await selectCandidates(ctx, opts);
  if (!candidates.length) { console.error('No candidates selected.'); process.exit(1); }

  const outDir = path.join(ROOT, date);
  await mkdir(outDir, { recursive: true });
  // Group under <date> at noon UTC, never future, staggered so the first sorts newest.
  const base = Math.min(Date.parse(`${date}T12:00:00Z`), Date.now());

  const posts = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const title = titleOf(c);
    const slug = slugify(title) || c.post_type;
    const renderable = !c.copyOnly && TYPES[c.post_type]?.render && POST_TYPES[c.post_type] && c.payload;

    const images = { portrait: [], landscape: [] };
    if (renderable) {
      const spec = POST_TYPES[c.post_type];
      const cards = await spec.cards(c.payload);
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
    }

    posts.push({
      title,
      facts: factsFor(c),
      meta: {
        post_type: c.post_type,
        topic_key: `manual:${c.post_type}:${date}:${slug}`,
        scheduled_for: new Date(base - i * 60000).toISOString(),
        cta_variant: CTA[c.post_type] || 'none',
        feed: !!TYPES[c.post_type]?.feed,
        ...(TYPES[c.post_type]?.card ? { card: TYPES[c.post_type].card } : {}),
        ...(renderable ? {
          hero_image: feedHeroUrl(c.post_type, c.payload),
          tmdb_refs: c.tmdb_refs,
          payload: c.payload,
        } : {}),
        images,
      },
    });
    console.log(`  ${c.post_type}${renderable ? ` · ${title} (${images.portrait.length} card${images.portrait.length > 1 ? 's' : ''})` : ' · copy-only'}`);
  }
  await closeBrowser();

  await writeFile(path.join(outDir, `${date}.md`), serialize(date, posts));
  console.log(`\n${posts.length} post(s) → ${path.relative(process.cwd(), outDir)}/`);
  console.log(`Next: write the copy in ${date}.md, then  npm run mkt:manual:publish ${date}`);
};

main().catch(async (err) => { console.error(err); await closeBrowser(); process.exit(1); });
