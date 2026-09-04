// One-off sweep: strip the retired "No wrong answers" closer from posts that are
// still awaiting approval, so the phrase doesn't ship on copy written before the
// rule changed. Published/approved posts are deliberately out of scope — this
// only touches drafts a human hasn't signed off yet.
//
// Conservative by design. It removes the closer ONLY where it sits as a trailing
// sentence; anything else that mentions the phrase is reported for a human to
// look at rather than edited. `generated_copy` is left alone — that's the
// original worker output and stays as the audit trail.
//
// Usage (repo root, .env present) — dry run is the DEFAULT:
//   node --env-file=.env marketing/copy/sweep-closer.mjs
//   node --env-file=.env marketing/copy/sweep-closer.mjs --apply
//   node --env-file=.env marketing/copy/sweep-closer.mjs --status=needs_review,planned
import { getSupabase } from '../lib/supabase.mjs';

const PHRASE = /\bno wrong answers\b/i;
// The closer as it actually appears: last thing in the field, optional punctuation.
const TRAILING_CLOSER = /[\s—–-]*\bno wrong answers\b\s*[.!?]*\s*$/i;

/**
 * Strip the trailing closer from one string.
 * @returns {{text: string, changed: boolean, flagged: boolean}}
 *   flagged = the phrase is present but not as a trailing closer, so a human
 *   should decide. Never edited automatically.
 */
export const stripCloser = (input) => {
  const text = typeof input === 'string' ? input : '';
  if (!PHRASE.test(text)) return { text, changed: false, flagged: false };
  if (!TRAILING_CLOSER.test(text)) return { text, changed: false, flagged: true };

  const stripped = text.replace(TRAILING_CLOSER, '').trimEnd();
  // Refuse to leave a field empty or ending mid-thought — report instead.
  if (!stripped || !/[.!?"'’”]$/.test(stripped)) {
    return { text, changed: false, flagged: true };
  }
  return { text: stripped, changed: true, flagged: false };
};

const SOCIAL_FIELDS = ['x', 'threads', 'instagram'];

/**
 * Clean one post's `copy`. Paragraph count in page_body is preserved — the
 * `inline_titles` flag downstream depends on it — so a paragraph is never
 * dropped, only shortened.
 */
export const sweepCopy = (copy) => {
  if (!copy || typeof copy !== 'object') return { copy, changes: [], flags: [] };
  const next = { ...copy };
  const changes = [];
  const flags = [];

  for (const field of SOCIAL_FIELDS) {
    const r = stripCloser(next[field]);
    if (r.changed) { changes.push({ field, before: next[field], after: r.text }); next[field] = r.text; }
    else if (r.flagged) flags.push({ field, text: next[field] });
  }

  if (Array.isArray(next.page_body)) {
    const body = [...next.page_body];
    body.forEach((para, i) => {
      const r = stripCloser(para);
      if (r.changed) { changes.push({ field: `page_body[${i}]`, before: para, after: r.text }); body[i] = r.text; }
      else if (r.flagged) flags.push({ field: `page_body[${i}]`, text: para });
    });
    if (changes.some(c => c.field.startsWith('page_body'))) next.page_body = body;
  }

  return { copy: next, changes, flags };
};

const preview = (s) => {
  const t = String(s).replace(/\s+/g, ' ');
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
};

const main = async () => {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const statusArg = args.find(a => a.startsWith('--status='));
  const statuses = statusArg
    ? statusArg.slice('--status='.length).split(',').map(s => s.trim()).filter(Boolean)
    : ['needs_review'];

  const supabase = getSupabase();
  console.log(`Scanning posts with status: ${statuses.join(', ')}`);
  console.log(apply ? 'MODE: apply (will write)\n' : 'MODE: dry run (no writes)\n');

  const { data: posts, error } = await supabase
    .from('marketing_posts')
    .select('id, post_type, status, scheduled_for, copy')
    .in('status', statuses)
    .not('copy', 'is', null)
    .order('scheduled_for');
  if (error) throw new Error(error.message);

  let hit = 0;
  let written = 0;
  let flagged = 0;

  for (const post of posts || []) {
    const { copy, changes, flags } = sweepCopy(post.copy);
    if (!changes.length && !flags.length) continue;

    hit++;
    console.log(`${post.post_type} · ${String(post.scheduled_for).slice(0, 10)} · ${post.id}`);
    for (const c of changes) {
      console.log(`  ${c.field}`);
      console.log(`    -  ${preview(c.before)}`);
      console.log(`    +  ${preview(c.after)}`);
    }
    for (const f of flags) {
      flagged++;
      console.log(`  ! ${f.field} mentions the phrase but not as a trailing closer — left for a human`);
      console.log(`      ${preview(f.text)}`);
    }

    if (apply && changes.length) {
      const { error: upErr } = await supabase
        .from('marketing_posts')
        .update({ copy, updated_at: new Date().toISOString() })
        .eq('id', post.id);
      if (upErr) console.error(`  ✗ write failed: ${upErr.message}`);
      else { written++; console.log('  ✓ updated'); }
    }
    console.log();
  }

  console.log(`Scanned ${(posts || []).length} post(s); ${hit} contained the phrase.`);
  if (flagged) console.log(`${flagged} field(s) need a human — not edited.`);
  console.log(apply ? `Wrote ${written} post(s).` : 'Dry run — nothing written. Re-run with --apply to write.');
};

const isMain = process.argv[1] && process.argv[1].endsWith('sweep-closer.mjs');
if (isMain) main().catch((err) => { console.error(err); process.exit(1); });
