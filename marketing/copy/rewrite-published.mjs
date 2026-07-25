// Rewrite published What's On articles whose page_body still reads like a TMDB dump.
// Pull: export briefs + enrichment for posts that need new copy.
// Apply: merge page_body + sources from <post_id>.rewrite.json into live rows.
//
// Usage (repo root, .env present):
//   node --env-file=.env marketing/copy/rewrite-published.mjs pull
//   node --env-file=.env marketing/copy/rewrite-published.mjs apply [--dry-run]
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getSupabase } from '../lib/supabase.mjs';
import { buildBrief } from './brief.mjs';
import { enrichPost } from './enrich.mjs';
import { JOBS_DIR } from './paths.mjs';

const REWRITE_DIR = path.join(JOBS_DIR, 'rewrite');
const TEMPLATE_MARKERS = [
  'That recognition is part of the title',
  'minute running time',
];

const needsRewrite = (copy) => {
  const body = (copy?.page_body || []).join('\n');
  return TEMPLATE_MARKERS.some((m) => body.includes(m));
};

const pull = async () => {
  const supabase = getSupabase();
  const { data: posts, error } = await supabase
    .from('marketing_posts')
    .select('id, post_type, payload, tmdb_refs, scheduled_for, slug, copy')
    .in('status', ['approved', 'published', 'partially_published'])
    .order('scheduled_for', { ascending: false });
  if (error) throw new Error(error.message);

  const todo = (posts || []).filter((p) => needsRewrite(p.copy));
  await mkdir(REWRITE_DIR, { recursive: true });

  const manifest = [];
  for (const post of todo) {
    const research = await enrichPost(post).catch(() => []);
    const brief = await buildBrief(post, research);
    const briefPath = path.join(REWRITE_DIR, `${post.id}.brief.md`);
    const metaPath = path.join(REWRITE_DIR, `${post.id}.meta.json`);
    await writeFile(briefPath, brief);
    await writeFile(metaPath, JSON.stringify({
      id: post.id,
      slug: post.slug,
      post_type: post.post_type,
      page_title: post.copy?.page_title || null,
      scheduled_for: post.scheduled_for,
    }, null, 2));
    manifest.push({
      id: post.id,
      slug: post.slug,
      post_type: post.post_type,
      brief: `marketing/copy/jobs/rewrite/${post.id}.brief.md`,
      output: `marketing/copy/jobs/rewrite/${post.id}.rewrite.json`,
    });
  }

  await writeFile(path.join(REWRITE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} rewrite brief(s) to marketing/copy/jobs/rewrite/`);
};

const apply = async (dryRun = false) => {
  const supabase = getSupabase();
  let files = [];
  try {
    files = (await readdir(REWRITE_DIR)).filter((f) => f.endsWith('.rewrite.json'));
  } catch {
    console.error('No rewrite directory. Run pull first.');
    process.exit(1);
  }
  if (!files.length) {
    console.log('No .rewrite.json files found.');
    return;
  }

  let applied = 0;
  let skipped = 0;
  for (const file of files) {
    const postId = file.replace(/\.rewrite\.json$/, '');
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(REWRITE_DIR, file), 'utf8'));
    } catch (err) {
      console.error(`✗ ${postId}: invalid JSON — ${err.message}`);
      skipped++;
      continue;
    }

    const page_body = Array.isArray(parsed.page_body)
      ? parsed.page_body.map((p) => String(p).trim()).filter(Boolean)
      : [];
    const sources = Array.isArray(parsed.sources)
      ? parsed.sources
          .map((s) => ({ title: String(s?.title || s?.url || '').trim(), url: String(s?.url || '').trim() }))
          .filter((s) => /^https?:\/\//i.test(s.url))
      : [];

    if (page_body.length < 3) {
      console.error(`✗ ${postId}: page_body needs at least 3 paragraphs (got ${page_body.length})`);
      skipped++;
      continue;
    }
    if (sources.length < 2) {
      console.error(`✗ ${postId}: sources needs at least 2 URLs (got ${sources.length})`);
      skipped++;
      continue;
    }

    const { data: row, error: fetchErr } = await supabase
      .from('marketing_posts')
      .select('copy, slug')
      .eq('id', postId)
      .single();
    if (fetchErr || !row) {
      console.error(`✗ ${postId}: not found — ${fetchErr?.message || 'missing'}`);
      skipped++;
      continue;
    }

    const copy = { ...row.copy, page_body, sources };
    if (dryRun) {
      console.log(`• ${postId} (${row.slug}): would update ${page_body.length} paragraphs, ${sources.length} sources`);
      applied++;
      continue;
    }

    const { error } = await supabase
      .from('marketing_posts')
      .update({ copy, updated_at: new Date().toISOString() })
      .eq('id', postId);
    if (error) {
      console.error(`✗ ${postId}: db error — ${error.message}`);
      skipped++;
    } else {
      console.log(`✓ ${postId} (${row.slug})`);
      applied++;
    }
  }

  console.log(`\n${dryRun ? 'Would apply' : 'Applied'} ${applied}, skipped ${skipped}.`);
};

const main = async () => {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'pull') return pull();
  if (cmd === 'apply') return apply(rest.includes('--dry-run'));
  console.error('Usage: rewrite-published.mjs pull | apply [--dry-run]');
  process.exit(1);
};

main().catch((err) => { console.error(err); process.exit(1); });
