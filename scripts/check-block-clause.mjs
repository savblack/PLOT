// Fail the build when a function that serves user identity loses its block filter.
//
// WHY THIS EXISTS
// Blocking hides identity through seven `security definer` RPCs, because
// `public.profiles` has one select policy (`auth.uid() = id`) and every
// identity read bypasses RLS entirely. 20260913090000_block_hides_identity.sql
// added `public.not_blocked(...)` to each of them.
//
// The danger is not adding it. The danger is the next person removing it
// without meaning to. `create or replace function` is a whole-body
// replacement: you do not amend a function, you retype it, and if you start
// from the migration you remember rather than the body that is live, you
// silently revert everything added since. That is precisely how
// 20260725000001 reverted a conflict target and broke every history write for
// two weeks (see scripts/check-migration-redefinitions.mjs).
//
// If it happens here the failure is worse than an error, because there is no
// error: blocking keeps working everywhere else, the blocked user simply
// becomes visible again on one surface. Nobody is told. tsc, eslint and the
// migration test are all green — a function without a WHERE clause is a
// perfectly valid function, and db:migration-test only proves the SQL parses.
//
// So this reads the LATEST definition of every function across all migrations
// — what production actually runs, not what any one file says — and requires
// that each one reading `profiles` is classified in exactly one of two lists
// below. Silence is not a valid state. A redefinition that drops the clause
// fails by name.
//
// Rules:
//   1. unclassified      — a profiles-reading function in neither list
//   2. unknown           — a list names a function no migration defines
//   3. overlap           — a function in both lists
//   4. missing-clause    — BLOCK_FILTERED, but its latest body has no not_blocked
//   5. unexpected-clause — BLOCK_EXEMPT, but its latest body has one
//
// This is a static check. It proves the clause is present, not that it is
// correct — only two real accounts on Staging prove that. See
// docs/superpowers/specs/2026-09-12-report-and-block-design.md.
//
// Usage:
//   node scripts/check-block-clause.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { latestDefinitions, checkBlockClause } from './lib/blockClauseChecks.mjs';

const DIR = 'supabase/migrations';

// Must carry `not_blocked`. Every one of these returns another user's identity
// — username, display name, avatar — to a viewer.
const BLOCK_FILTERED = [
  'get_profile_card',      // the public profile page
  'search_users',          // user search
  'suggested_users',       // suggestion rails
  'list_followers',        // follower list
  'list_following',        // following list
  'list_follow_requests',  // the requests screen
  'list_notifications',    // "x started following you", with their avatar
];

// Must NOT carry it, each for a reason that has to survive review.
const BLOCK_EXEMPT = {
  handle_new_user:
    'The signup trigger. It writes the profiles row and never reads one back for '
    + 'a viewer, and it runs before the account it creates could have blocked or '
    + 'been blocked by anyone. Listing it here was impossible until 20260913110000: '
    + 'the first run of this check found production\'s signup trigger existed in no '
    + 'migration at all, created by hand through the Supabase dashboard, and this '
    + 'check only sees what the migrations say.',
  username_available:
    'Uniqueness is not a visibility question. If this respected blocks, a blocked '
    + 'user would be told a taken username is free, and the insert would then fail '
    + 'on the unique index anyway.',
  generate_username:
    'Same as username_available: it must see every username to avoid collisions.',
  is_profile_public:
    'A primitive used INSIDE policies that already conjoin not_blocked separately '
    + '(see 20260912130000). Folding the block in here would double-apply it and '
    + 'make the policies impossible to read.',
  list_blocked_users:
    'Deliberately bypasses the filter. Blocking is symmetric, so every ordinary '
    + 'identity path returns nothing for the people you have blocked — including '
    + 'the list you unblock them from. Scoped to blocker_id = auth.uid().',
  record_kofi_tip:
    'Server-side webhook handler with no viewer context; matches a tip to an '
    + 'account and writes a flag.',
  sync_profile_marketing_flag:
    'Trigger that mirrors one column to the marketing tables. Writes, never reads '
    + 'identity on behalf of a viewer.',
  notify_edge_function:
    'Trigger that posts a row to an edge function. No viewer.',
};

const EXPLANATIONS = {
  unclassified: [
    'A function that reads `profiles` returns somebody\'s identity to somebody',
    'else, which is exactly what a block has to stop. Add it to BLOCK_FILTERED',
    'and give it a not_blocked clause, or to BLOCK_EXEMPT with a reason.',
    'list_notifications was missed by the original design spec this way.',
  ],
  unknown: [
    'Either the name is a typo or the function was renamed or dropped. A stale',
    'entry silently guards nothing, which is worse than no entry at all.',
  ],
  overlap: [
    'The lists must be disjoint, or "is this filtered?" has two answers.',
  ],
  'missing-clause': [
    'This is the July 2026 shape: a later migration recreated the function from',
    'an older body and dropped the clause. Blocking still works everywhere else,',
    'so nothing fails — the blocked account just reappears on this one surface.',
    'Diff it against production before fixing: npm run db:function-diff',
  ],
  'unexpected-clause': [
    'An exempt function grew a block clause. If that is deliberate, move it to',
    'BLOCK_FILTERED. Check the reason recorded next to it first — most of these',
    'break in a subtle way when filtered (username_available starts lying).',
  ],
};

const HEADINGS = {
  unclassified:        'read `profiles` but are in neither BLOCK_FILTERED nor BLOCK_EXEMPT',
  unknown:             'are listed here but defined by no migration',
  overlap:             'are in BOTH lists',
  'missing-clause':    'must carry `not_blocked` but their latest definition does not',
  'unexpected-clause': 'are exempt but their latest definition carries `not_blocked`',
};

let files;
try {
  files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
} catch {
  console.error(`\n✗ cannot read ${DIR}/`);
  console.error('  This check is hard-wired to that path. If migrations moved,');
  console.error('  update scripts/check-block-clause.mjs to match.\n');
  process.exit(1);
}

const latest = latestDefinitions(
  files.map(file => ({ file, sql: readFileSync(join(DIR, file), 'utf8') })),
);

const { ok, failures } = checkBlockClause({
  latest,
  filtered: BLOCK_FILTERED,
  exempt: Object.keys(BLOCK_EXEMPT),
});

if (ok) {
  console.log(
    `✓ all ${BLOCK_FILTERED.length} identity functions carry the block filter `
    + `(${Object.keys(BLOCK_EXEMPT).length} exempt, each with a reason)`,
  );
  process.exit(0);
}

console.error('\n✗ the block filter and the identity functions are out of step:\n');
for (const { code, names } of failures) {
  console.error(`  ${names.length} function(s) ${HEADINGS[code]}:`);
  for (const name of names) {
    const where = latest.get(name)?.file;
    console.error(`      ${name}${where ? `   (latest: ${where})` : ''}`);
  }
  console.error('');
  for (const line of EXPLANATIONS[code]) console.error(`    ${line}`);
  console.error('');
}
console.error('  Both lists live in scripts/check-block-clause.mjs.\n');
process.exit(1);
