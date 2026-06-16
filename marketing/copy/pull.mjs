// Step 1 of the copy contract (runner-agnostic).
// Finds posts that have been planned but not yet written, and emits a
// self-contained brief per post into marketing/copy/jobs/. The AI worker
// (Claude Code, Codex, …) then writes one <post_id>.copy.json per job and
// runs save.mjs. This script reads only — it never mutates the database.
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { buildBrief } from './brief.mjs';

export const JOBS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'jobs');

const main = async () => {
  const supabase = getSupabase();

  // Posts due in the next ~24h that still need copy. We include 'failed' so a
  // worker re-run can retry a post a previous run couldn't complete.
  const { data: posts, error } = await supabase
    .from('marketing_posts')
    .select('id, post_type, payload, scheduled_for, status')
    .in('status', ['planned', 'failed'])
    .is('copy', null)
    .lte('scheduled_for', new Date(Date.now() + 24 * 3600000).toISOString())
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  // Clear generated artifacts from prior runs so stale briefs/answers never get
  // re-processed — but keep the dir and its .gitignore.
  await mkdir(JOBS_DIR, { recursive: true });
  for (const f of await readdir(JOBS_DIR)) {
    if (f === '.gitignore') continue;
    await rm(path.join(JOBS_DIR, f), { force: true });
  }

  const todo = (posts || []).filter(p => p.payload && Object.keys(p.payload).length);
  const manifest = [];
  for (const post of todo) {
    const briefPath = path.join(JOBS_DIR, `${post.id}.brief.md`);
    await writeFile(briefPath, await buildBrief(post));
    manifest.push({
      post_id: post.id,
      post_type: post.post_type,
      brief: `marketing/copy/jobs/${post.id}.brief.md`,
      output: `marketing/copy/jobs/${post.id}.copy.json`,
    });
  }
  await writeFile(path.join(JOBS_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  if (!manifest.length) {
    console.log('No posts need copy. Nothing to do.');
    return;
  }
  console.log(`Wrote ${manifest.length} brief(s) to marketing/copy/jobs/:`);
  for (const m of manifest) console.log(`  - ${m.post_type} → ${m.output}`);
  console.log('\nNext: write each <post_id>.copy.json, then run `npm run mkt:copy:save`.');
};

main().catch((err) => { console.error(err); process.exit(1); });
