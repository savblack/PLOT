// Step 2 of the copy contract (runner-agnostic).
// Reads each <post_id>.copy.json the worker produced, validates it against the
// shared schema (the safety boundary — identical for every model), and on
// success writes it to the post and advances status to 'copy_ready'. Invalid
// output is rejected and the post is left untouched for the next run.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { getSupabase } from '../lib/supabase.mjs';
import { validateCopy, validateConversation, validateGuide } from './schema.mjs';
import { JOBS_DIR } from './paths.mjs';

// post_id -> post_type, from the manifest pull.mjs wrote, so we validate each
// answer against the right contract (conversation posts are text-only).
const loadTypes = async () => {
  try {
    const manifest = JSON.parse(await readFile(path.join(JOBS_DIR, 'manifest.json'), 'utf8'));
    return new Map(manifest.map(m => [m.post_id, m.post_type]));
  } catch {
    return new Map();
  }
};

const main = async () => {
  const supabase = getSupabase();

  let entries = [];
  try {
    entries = (await readdir(JOBS_DIR)).filter(f => f.endsWith('.copy.json'));
  } catch {
    console.log('No jobs directory. Run `npm run mkt:copy:pull` first.');
    return;
  }
  if (!entries.length) {
    console.log('No .copy.json answers found in marketing/copy/jobs/.');
    return;
  }

  const types = await loadTypes();
  let saved = 0, rejected = 0;
  for (const file of entries) {
    const postId = file.replace(/\.copy\.json$/, '');
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(JOBS_DIR, file), 'utf8'));
    } catch (err) {
      console.error(`✗ ${postId}: invalid JSON — ${err.message}`);
      rejected++;
      continue;
    }

    const postType = types.get(postId);
    const validate = postType === 'question' ? validateConversation
      : postType === 'guide' ? validateGuide
      : validateCopy;
    const { valid, errors, copy } = validate(parsed);
    if (!valid) {
      console.error(`✗ ${postId}: rejected —\n    ${errors.join('\n    ')}`);
      rejected++;
      continue;
    }

    // Only fill copy for posts still awaiting it — never clobber a post that
    // has already advanced (rendered, reviewed, published).
    const { data, error } = await supabase
      .from('marketing_posts')
      .update({ copy, generated_copy: copy, status: 'copy_ready', updated_at: new Date().toISOString() })
      .eq('id', postId)
      .in('status', ['planned', 'failed'])
      .select('id');
    if (error) {
      console.error(`✗ ${postId}: db error — ${error.message}`);
      rejected++;
    } else if (!data?.length) {
      console.warn(`• ${postId}: skipped (no longer awaiting copy)`);
    } else {
      console.log(`✓ ${postId}: copy saved, status → copy_ready`);
      saved++;
    }
  }

  console.log(`\nSaved ${saved}, rejected ${rejected}.`);
  if (rejected) process.exitCode = 1; // surface bad worker output to the runner
};

main().catch((err) => { console.error(err); process.exit(1); });
