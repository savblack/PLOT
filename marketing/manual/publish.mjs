// Manual flow — publish step.
//   node marketing/manual/publish.mjs [YYYY-MM-DD] [--dry-run]
//
// Reads plot-posts/<date>/<date>.md, validates the copy, and upserts each post
// to marketing_posts as status='published' so it appears on theplot.tv/whats-on.
// status='published' means the auto-publisher (which only touches
// 'pending_review') will NOT re-post these to social. Idempotent by topic_key.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { postSlug } from '../lib/feed.mjs';
import { nextPublishAt, isoDate } from '../lib/dates.mjs';
import { parse } from './format.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'plot-posts');
const REQUIRED = ['x', 'instagram', 'threads', 'page_title'];

const validate = (posts) => {
  const errors = [];
  posts.forEach((p, i) => {
    const tag = `post ${i + 1} (${p.meta.post_type})`;
    for (const f of REQUIRED) if (!p.copy[f]?.trim?.()) errors.push(`${tag}: "${f}" is empty`);
    if (!p.copy.page_body?.length) errors.push(`${tag}: "What's On — body" is empty`);
    if (p.copy.x && /https?:\/\/|www\./i.test(p.copy.x)) errors.push(`${tag}: X copy contains a URL`);
    if (p.copy.x && p.copy.x.length > 280) errors.push(`${tag}: X copy is ${p.copy.x.length} chars (>280)`);
  });
  return errors;
};

const main = async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || isoDate(nextPublishAt());
  const file = path.join(ROOT, date, `${date}.md`);

  const all = parse(await readFile(file, 'utf8'));
  if (!all.length) { console.error(`No posts found in ${file}`); process.exit(1); }

  // Only feed-eligible types go to What's On; social-only posts (spotlight,
  // questions, ...) are saved locally and posted to social by hand.
  const posts = all.filter(p => p.meta.feed);
  const skipped = all.filter(p => !p.meta.feed);
  for (const p of skipped) console.log(`skip (social-only): ${p.meta.post_type}`);
  if (!posts.length) { console.log('\nNo feed-eligible posts for this date.'); return; }

  const errors = validate(posts);
  if (errors.length) {
    console.error(`Copy not ready (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const rows = posts.map(p => ({
    post_type: p.meta.post_type,
    topic_key: p.meta.topic_key,
    status: 'published',
    scheduled_for: p.meta.scheduled_for,
    digest_sent_at: p.meta.scheduled_for,
    tmdb_refs: p.meta.tmdb_refs || [],
    payload: p.meta.payload || {},
    // slug from the article title (matches the automated pipeline).
    slug: postSlug(p.copy.page_title, p.meta.scheduled_for),
    copy: { ...p.copy, hero_image: p.meta.hero_image },
  }));

  if (dryRun) {
    console.log(`Dry run — ${rows.length} post(s) parsed and valid:`);
    for (const r of rows) console.log(`  ${r.post_type.padEnd(12)} /whats-on/${r.slug}`);
    return;
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('marketing_posts')
    .upsert(rows, { onConflict: 'topic_key' })
    .select('slug,post_type,status');
  if (error) throw new Error(error.message);

  for (const r of data) console.log(`${r.status}  ${r.post_type.padEnd(12)} https://theplot.tv/whats-on/${r.slug}`);
  console.log(`\nPublished ${data.length} post(s) to the What's On feed.`);
};

main().catch((err) => { console.error(err); process.exit(1); });
