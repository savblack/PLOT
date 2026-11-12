import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  buildSqlUsers,
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

function check(file, sql, { prior = [], codeSearch = noCode } = {}) {
  return checkMigration({ file, sql, priorAndSelf: [...prior, { file, sql }], codeSearch });
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
