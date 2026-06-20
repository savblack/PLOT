// Step 1 of the copy contract (runner-agnostic).
// Finds posts that have been planned but not yet written, and emits a
// self-contained brief per post into marketing/copy/jobs/. The AI worker
// (Claude Code, Codex, …) then writes one <post_id>.copy.json per job and
// runs save.mjs. This script reads only — it never mutates the database.
import { mkdir, writeFile, readdir, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSupabase } from '../lib/supabase.mjs';
import { buildBrief, buildConversationBrief } from './brief.mjs';
import { enrichPost } from './enrich.mjs';
import { JOBS_DIR } from './paths.mjs';

const main = async () => {
  const supabase = getSupabase();

  // Posts in the upcoming week that still need copy (the weekly batch plans the
  // whole week up front). 'failed' is included so a re-run can retry.
  const { data: posts, error } = await supabase
    .from('marketing_posts')
    .select('id, post_type, payload, tmdb_refs, scheduled_for, status')
    .in('status', ['planned', 'failed'])
    .is('copy', null)
    .lte('scheduled_for', new Date(Date.now() + 8 * 86400000).toISOString())
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
    if (post.post_type === 'question') {
      // Text-only question: no research pack, its own short brief.
      await writeFile(briefPath, await buildConversationBrief(post));
    } else {
      // Enrich from free sources (extended TMDB + Wikipedia). Best-effort: a
      // failed lookup still yields a brief, just without the research pack.
      const research = await enrichPost(post).catch(() => []);
      await writeFile(briefPath, await buildBrief(post, research));
    }
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

// Only run when invoked directly (`node …/pull.mjs`) — never as a side-effect of
// being imported. save.mjs used to import a constant from here, which silently
// re-ran this pull (DB query + jobs-dir wipe) and raced the answers it was saving.
const runDirectly = process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (runDirectly) main().catch((err) => { console.error(err); process.exit(1); });
