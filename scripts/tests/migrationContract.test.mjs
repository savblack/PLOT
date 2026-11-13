import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildSchemaState,
  buildSqlUsers,
  findDeadReferences,
  rankByTable,
  checkMigration,
  findChanges,
  parseAcknowledgements,
  sqlReferences,
} from '../check-migration-contract.mjs';

const FIXTURES = join(import.meta.dirname, 'fixtures/migration-contract');
const fixture = name => readFileSync(join(FIXTURES, name), 'utf8');
const labels = changes => changes.map(c => `${c.kind} ${c.table ? `${c.table}.` : ''}${c.name}`);

const noCode = () => [];
const codeUses = names => name => (names.includes(name) ? [`apps/web/src/x.js:1: ${name}`] : []);

function check(file, sql, { prior = [], codeSearch = noCode, filesNaming, mobileHistory } = {}) {
  return checkMigration({ file, sql, priorAndSelf: [...prior, { file, sql }], codeSearch, filesNaming, mobileHistory });
}

test('finds every destructive kind, including DDL inside a do block', () => {
  assert.deepEqual(labels(findChanges(fixture('every-destructive-kind.sql'))), [
    'drop table old_a',
    'drop table old_b',
    'drop view old_signals',
    'drop function old_rpc',
    'drop function other_rpc',
    'drop type old_kind',
    'drop column history.old_note',
    'retype column history.rating',
    'set not null history.watched_at',
    'not null without default history.source',
    'rename table journal',
    'rename column history.seen_on',
    'rename function old_name',
    'rename view old_view',
    'rename enum value watch_status.plan',
    'rename type mood',
    'drop column profiles.do_block_col',
  ]);
});

test('expand-only changes are not flagged', () => {
  assert.deepEqual(findChanges(fixture('safe-expand.sql')), []);
});

test('a comment that mentions a drop is not a change', () => {
  assert.deepEqual(findChanges('-- alter table public.x drop column y;\nselect 1;'), []);
  assert.deepEqual(findChanges('/* drop table public.x; */ select 1;'), []);
});

test('a dropped column the code still uses fails', () => {
  const { problems } = check('20990101000000_a.sql', fixture('drop-column-used.sql'), { codeSearch: codeUses(['legacy_flag']) });
  assert.equal(problems.length, 1);
  assert.equal(problems[0].kind, 'drop column');
  assert.equal(problems[0].name, 'legacy_flag');
  assert.match(problems[0].refs[0], /^code  apps\/web\/src\/x\.js/);
});

test('a dropped column nothing uses passes', () => {
  const { problems } = check('20990101000000_a.sql', fixture('drop-column-used.sql'));
  assert.deepEqual(problems, []);
});

test('an acknowledged removal passes even when code matches', () => {
  const { problems, acknowledged } = check('20990101000000_a.sql', fixture('drop-column-acknowledged.sql'), { codeSearch: codeUses(['legacy_flag']) });
  assert.deepEqual(problems, []);
  assert.deepEqual(labels(acknowledged), ['drop column profiles.legacy_flag']);
});

test('an acknowledgement needs a reason', () => {
  const { problems } = check('20990101000000_a.sql', fixture('ack-without-reason.sql'));
  assert.deepEqual(problems.map(p => p.kind), ['acknowledgement']);
  assert.deepEqual(parseAcknowledgements('-- contracts: a.b (because)').acks.get('a.b'), 'because');
  assert.deepEqual(parseAcknowledgements('-- contracts: a ()').missingReason, ['a']);
});

test('an acknowledgement for a different name does not cover this one', () => {
  const sql = '-- contracts: other_col (gone)\nalter table public.profiles drop column legacy_flag;';
  const { problems } = check('20990101000000_a.sql', sql, { codeSearch: codeUses(['legacy_flag']) });
  assert.equal(problems.length, 1);
});

test('a SQL function that still names a dropped column fails', () => {
  // plpgsql resolves column names only when the line runs, so this is the
  // case Postgres accepts silently (20261004100000 in production).
  const prior = [{
    file: '20980101000000_trigger.sql',
    sql: `create or replace function public.on_accept() returns trigger language plpgsql as $$
begin
  update public.watch_together set shares_full = true where id = new.id;
  return new;
end $$;`,
  }];
  const sql = 'alter table public.watch_together drop column shares_full;';
  const { problems } = check('20990101000000_a.sql', sql, { prior });
  assert.equal(problems.length, 1);
  assert.match(problems[0].refs[0], /^sql   function on_accept {2}\(defined in 20980101000000_trigger\.sql\)/);
});

test('a function redefined in the same migration without the column passes', () => {
  const prior = [{
    file: '20980101000000_trigger.sql',
    sql: 'create or replace function public.on_accept() returns trigger language plpgsql as $$ begin perform shares_full; end $$;',
  }];
  const sql = `create or replace function public.on_accept() returns trigger language plpgsql as $$
begin
  -- shares_full was dropped below; this comment does not count as a use
  return new;
end $$;
alter table public.watch_together drop column shares_full;`;
  assert.deepEqual(check('20990101000000_a.sql', sql, { prior }).problems, []);
});

test('a cron job that calls a dropped function fails, an unscheduled one does not', () => {
  const scheduled = { file: '20980101000000_cron.sql', sql: "select cron.schedule('nightly', '0 3 * * *', $$ select public.old_rpc() $$);" };
  const drop = 'drop function if exists public.old_rpc();';
  assert.equal(check('20990101000000_a.sql', drop, { prior: [scheduled] }).problems.length, 1);

  const unscheduled = { file: '20980201000000_unschedule.sql', sql: "select cron.unschedule('nightly');" };
  assert.deepEqual(check('20990101000000_a.sql', drop, { prior: [scheduled, unscheduled] }).problems, []);
});

test('a dropped function does not count its own old body as a user', () => {
  const prior = [{ file: '20980101000000_fn.sql', sql: 'create function public.old_rpc() returns int language sql as $$ select old_rpc_helper() $$;' }];
  assert.deepEqual(check('20990101000000_a.sql', 'drop function public.old_rpc();', { prior }).problems, []);
});

test('a not-null column with no default always needs an acknowledgement', () => {
  const sql = 'alter table public.history add column source text not null;';
  const { problems } = check('20990101000000_a.sql', sql);
  assert.deepEqual(problems.map(p => p.kind), ['not null without default']);
  const acked = check('20990101000000_a.sql', `-- contracts: history.source (backfilled; every writer sets it since #1300)\n${sql}`);
  assert.deepEqual(acked.problems, []);
});

test('sqlReferences matches whole words only', () => {
  const users = buildSqlUsers([{ file: 'f.sql', sql: 'create function public.f() returns int language sql as $$ select ratings_count from t $$;' }]);
  assert.deepEqual(sqlReferences('rating', users), []);
  assert.equal(sqlReferences('ratings_count', users).length, 1);
});

// ── A later migration naming something an earlier one removed ───────────────

const dropShares = {
  file: '20980101000000_drop.sql',
  sql: `create table public.watch_together (id uuid primary key, requester_shares_full boolean, status text);
alter table public.watch_together drop column requester_shares_full;`,
};

test('a function naming a column an earlier migration dropped fails', () => {
  const sql = fixture('names-dropped-column.sql');
  const { problems } = check('20990101000000_a.sql', sql, { prior: [dropShares] });
  assert.deepEqual(problems.map(p => `${p.kind} ${p.name}`), ['names a removed object requester_shares_full']);
  assert.match(problems[0].why, /drop column watch_together\.requester_shares_full in 20980101000000_drop\.sql/);
});

test('the same function passes when nothing dropped the column', () => {
  const created = { file: '20980101000000_create.sql', sql: 'create table public.watch_together (id uuid primary key, requester_shares_full boolean);' };
  assert.deepEqual(check('20990101000000_a.sql', fixture('names-dropped-column.sql'), { prior: [created] }).problems, []);
});

test('a dropped name that a later migration brings back is live again', () => {
  const readd = { file: '20980201000000_readd.sql', sql: 'alter table public.watch_together add column requester_shares_full boolean;' };
  assert.deepEqual(check('20990101000000_a.sql', fixture('names-dropped-column.sql'), { prior: [dropShares, readd] }).problems, []);
});

test('a dropped column name still live on another table is not dead', () => {
  const other = { file: '20980201000000_other.sql', sql: 'create table public.lists (id uuid, requester_shares_full boolean);' };
  assert.deepEqual(check('20990101000000_a.sql', fixture('names-dropped-column.sql'), { prior: [dropShares, other] }).problems, []);
});

test('dead-name-ok acknowledges a same-named thing, and needs a reason', () => {
  const sql = `-- dead-name-ok: requester_shares_full (a jsonb key in the payload, not the column)\n${fixture('names-dropped-column.sql')}`;
  assert.deepEqual(check('20990101000000_a.sql', sql, { prior: [dropShares] }).problems, []);
  const bare = `-- dead-name-ok: requester_shares_full\n${fixture('names-dropped-column.sql')}`;
  assert.deepEqual(check('20990101000000_a.sql', bare, { prior: [dropShares] }).problems.map(p => p.kind), ['names a removed object', 'acknowledgement']);
});

test('schema state follows renames and dropped functions', () => {
  const { live, dropped } = buildSchemaState([
    { file: 'a.sql', sql: 'create table public.journal (id uuid, seen_on date); create function public.old_rpc() returns int language sql as $$ select 1 $$;' },
    { file: 'b.sql', sql: 'alter table public.journal rename to history; alter table public.history rename column seen_on to watched_on; drop function public.old_rpc();' },
  ]);
  assert.ok(live.has('history') && live.has('watched_on'));
  assert.ok(!live.has('journal') && !live.has('seen_on') && !live.has('old_rpc'));
  assert.deepEqual([...dropped.keys()].sort(), ['journal', 'old_rpc', 'seen_on']);
});

test('findDeadReferences ignores bodies from earlier migrations', () => {
  const old = { file: '20970101000000_old.sql', sql: fixture('names-dropped-column.sql') };
  const sql = 'select 1;';
  assert.deepEqual(findDeadReferences({ file: '20990101000000_a.sql', sql, priorAndSelf: [old, dropShares, { file: '20990101000000_a.sql', sql }] }), []);
});

// ── Reading common-name hits ────────────────────────────────────────────────

test('hits in files that read the table by name come first, marked', () => {
  const lines = ['a.js:1: styles.note', 'b.js:9: row.note', 'c.js:3: note'];
  const ranked = rankByTable(lines, new Set(['b.js']));
  assert.equal(ranked.likely, 1);
  assert.deepEqual(ranked.lines, ['code* b.js:9: row.note', 'code  a.js:1: styles.note', 'code  c.js:3: note']);
  const { problems } = check('20990101000000_a.sql', 'alter table public.history drop column note;', {
    codeSearch: () => lines,
    filesNaming: () => new Set(['b.js']),
  });
  assert.equal(problems[0].refs[0], 'code* b.js:9: row.note');
  assert.match(problems[0].summary, /3 code line\(s\) in 3 file\(s\), 1 in files that read history by name/);
});

// ── iPhone builds that are already installed ────────────────────────────────

test('a name gone from main but used by mobile recently still fails', () => {
  const { problems } = check('20990101000000_a.sql', 'drop function public.old_rpc();', {
    mobileHistory: name => (name === 'old_rpc' ? 'abc1234 2026-11-01 feat(mobile): stop calling old_rpc' : null),
  });
  assert.equal(problems.length, 1);
  assert.match(problems[0].why, /mobile or shared core code did recently \(abc1234/);
  const acked = check('20990101000000_a.sql', '-- contracts: old_rpc (no installed build calls it: TestFlight only, all testers updated)\ndrop function public.old_rpc();', {
    mobileHistory: () => 'abc1234 2026-11-01 x',
  });
  assert.deepEqual(acked.problems, []);
});

test('a name mobile never used passes', () => {
  assert.deepEqual(check('20990101000000_a.sql', 'drop function public.old_rpc();', { mobileHistory: () => null }).problems, []);
});
