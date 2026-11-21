import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMigrationFiles, compareLedger, diffFingerprints, classifyDrift, planStagingApply, findMainCollisions,
} from '../../../../scripts/lib/migrationDriftChecks.mjs';

// The cases below are the drift actually found on 2026-09-25/26, trimmed to
// the versions involved. Each one is a shape the check has to fail on (or,
// for the branch-testing shapes, has to tolerate) for it to be worth running.

const files = (...names) => parseMigrationFiles(names);
const ledger = (rows) => new Map(Object.entries(rows));

test('parseMigrationFiles reads version and name, ignoring anything else', () => {
  const parsed = files('20260926160000_refresh_premium_badges.sql', 'README.md', '2026_bad.sql', 'seed.sql');
  assert.deepEqual([...parsed], [['20260926160000', 'refresh_premium_badges']]);
});

test('a version recorded under another migration fails on Staging (the refresh_premium_badges collision)', () => {
  const staging = compareLedger({
    files: files('20260926160000_refresh_premium_badges.sql'),
    ledger: ledger({ '20260926160000': 'watch_together_free' }),
  });
  assert.deepEqual(staging.mismatched, [{ version: '20260926160000', file: 'refresh_premium_badges', recorded: 'watch_together_free' }]);
  const { failures } = classifyDrift({ staging });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /Two migrations share a version/);
});

test('a row recorded by hand with no name is not a collision', () => {
  const r = compareLedger({ files: files('20260912130000_report_and_block.sql'), ledger: ledger({ '20260912130000': '' }) });
  assert.deepEqual(r.mismatched, []);
  assert.deepEqual(r.missing, []);
});

test('production rows with no file on main fail (the four billing migrations)', () => {
  const production = compareLedger({
    files: files('20260920090000_limit_user_top_lists_to_five.sql'),
    ledger: ledger({ '20260920090000': 'limit_user_top_lists_to_five', '20260923100000': 'atomic_stripe_subscription' }),
  });
  assert.deepEqual(production.extra, ['20260923100000']);
  assert.match(classifyDrift({ production }).failures[0], /applied from a branch/);
});

test('branch-only rows on Staging only warn, because Staging is where branches are tried', () => {
  const staging = compareLedger({
    files: files('20260920090000_limit_user_top_lists_to_five.sql'),
    ledger: ledger({ '20260920090000': 'limit_user_top_lists_to_five', '20260916140001': 'watch_event_foundation' }),
  });
  const { failures, warnings } = classifyDrift({ staging });
  assert.deepEqual(failures, []);
  assert.match(warnings[0], /20260916140001/);
});

test('a main migration Staging never recorded fails', () => {
  const staging = compareLedger({
    files: files('20260913120000_drop_for_you.sql', '20260917000000_broadcast_guide.sql'),
    ledger: ledger({ '20260913120000': 'drop_for_you' }),
  });
  assert.deepEqual(staging.missing, ['20260917000000']);
  assert.equal(classifyDrift({ staging }).failures.length, 1);
});

test("this branch's own new migrations are pending, not missing, on either database", () => {
  const branchNew = new Set(['20261001090000']);
  const production = compareLedger({
    files: files('20260927160000_watchlist_visibility.sql', '20261001090000_new_thing.sql'),
    ledger: ledger({ '20260927160000': 'watchlist_visibility' }),
    branchNew,
  });
  assert.deepEqual(production.missing, []);
  assert.deepEqual(production.pending, ['20261001090000']);
  const { failures, notes } = classifyDrift({ production });
  assert.deepEqual(failures, []);
  assert.equal(notes.length, 1);
});

test('an object production has and Staging lacks fails: the drift a ledger cannot show', () => {
  const schema = diffFingerprints(
    new Map([['function:taste_overlap(p_username text)', 'a']]),
    new Map([['function:taste_overlap(p_username text)', 'a'], ['cron:refresh-premium-badges', 'b']]),
  );
  assert.deepEqual(schema.onlyProduction, ['cron:refresh-premium-badges']);
  assert.match(classifyDrift({ schema }).failures[0], /refresh-premium-badges/);
});

test('differing definitions fail, unless Staging carries branch-only migrations', () => {
  const schema = diffFingerprints(new Map([['function:f()', 'x']]), new Map([['function:f()', 'y']]));
  assert.deepEqual(schema.differ, ['function:f()']);
  assert.equal(classifyDrift({ schema }).failures.length, 1);

  const staging = { missing: [], pending: [], extra: ['20260926130000'], mismatched: [] };
  const withBranch = classifyDrift({ schema, staging });
  assert.deepEqual(withBranch.failures, []);
  assert.ok(withBranch.warnings.some((w) => /branch-only migrations\)/.test(w)));
});

test('table grants only warn (project default privileges), but EXECUTE and column grants fail', () => {
  const schema = diffFingerprints(
    new Map([
      ['grant:history.anon', 'true,false,false,false'],
      ['execute:watch_together_row(p_other uuid)', 'false,false'],
    ]),
    new Map([
      ['grant:history.anon', 'true,true,true,true'],
      ['execute:watch_together_row(p_other uuid)', 'false,true'],
      ['column-grant:notifications.read_at.authenticated', 'update'],
    ]),
  );
  const { failures, warnings } = classifyDrift({ schema });
  assert.equal(failures.length, 2);
  assert.ok(failures.some((f) => /column-grant:notifications\.read_at/.test(f)));
  assert.ok(failures.some((f) => /execute:watch_together_row/.test(f)));
  assert.ok(warnings.some((w) => /grant:history\.anon/.test(w)));
  assert.ok(!failures.some((f) => /grant:history/.test(f)));
});

test('planStagingApply lists unrecorded migrations oldest first', () => {
  const plan = planStagingApply({
    files: files('20261119120000_taste_overlap_either_premium.sql', '20261118160000_newsletter_double_opt_in.sql', '20261118140000_premium_flag_insert_guard.sql'),
    ledger: ledger({ 20261118140000: 'premium_flag_insert_guard' }),
  });
  assert.deepEqual(plan.pending.map((p) => p.version), ['20261118160000', '20261119120000']);
  assert.deepEqual(plan.collisions, []);
});

test('planStagingApply reports a version Staging recorded under another name (the 20261119100000 collision)', () => {
  const plan = planStagingApply({
    files: files('20261119100000_episode_airings.sql', '20261119120000_taste_overlap_either_premium.sql'),
    ledger: ledger({ 20261119100000: 'import_jobs_tmdb_source' }),
  });
  assert.deepEqual(plan.collisions, [{ version: '20261119100000', file: 'episode_airings', recorded: 'import_jobs_tmdb_source' }]);
  assert.deepEqual(plan.pending.map((p) => p.version), ['20261119120000']);
});

test('planStagingApply leaves branch-only migrations on Staging alone', () => {
  const plan = planStagingApply({
    files: files('20261119100000_episode_airings.sql'),
    ledger: ledger({ 20261119100000: 'episode_airings', 20261120100000: 'import_jobs_tmdb_source' }),
  });
  assert.deepEqual(plan, { pending: [], collisions: [] });
});

// 2026-11-19: main took 20261118140000 for premium_flag_insert_guard while the
// Compare branch had its own 20261118140000 open. Staging skipped the branch's.
test('findMainCollisions: a version main gave to another file is a clash', () => {
  const clashes = findMainCollisions({
    files: files('20261118120000_avatars_owner_delete.sql', '20261118140000_taste_overlap_either_premium.sql'),
    mainFiles: files('20261118120000_avatars_owner_delete.sql', '20261118140000_premium_flag_insert_guard.sql'),
  });
  assert.deepEqual(clashes, [{ version: '20261118140000', file: 'taste_overlap_either_premium', onMain: 'premium_flag_insert_guard' }]);
});

test('findMainCollisions: main\'s own files and new versions are fine', () => {
  assert.deepEqual(findMainCollisions({
    files: files('20261118140000_premium_flag_insert_guard.sql', '20261119120000_taste_overlap_either_premium.sql'),
    mainFiles: files('20261118140000_premium_flag_insert_guard.sql'),
  }), []);
});
