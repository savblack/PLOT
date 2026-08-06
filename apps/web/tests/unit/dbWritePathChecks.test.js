import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colKey, extractConflictTargets, extractTableRefs, resolveConflictTargets,
  extractStringConstants, extractAppConflictTargets,
  extractMigrationKeyChanges, projectPendingSchema,
} from '../../../../scripts/lib/dbWritePathChecks.mjs';

// These are the real definitions either side of the two-week production outage
// (2026-07-25 → 2026-08-03), trimmed to the parts the checks read. A guard
// nobody has watched fail is not a guard, so the point of this file is to prove
// the check actually flags the broken one and clears the fixed one.

const BROKEN = `
CREATE OR REPLACE FUNCTION public.feed_post_from_history()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    if not exists (
      select 1 from public.journal
      where user_id = old.user_id and tmdb_id = old.tmdb_id
    ) then
      delete from public.feed_posts where author_id = old.user_id;
    end if;
    return old;
  end if;
  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title)
    values (new.user_id, 'watch', new.tmdb_id, new.media_type, new.title)
  on conflict (author_id, tmdb_id, media_type) do update
    set title = excluded.title;
  return new;
end;
$function$`;

const FIXED = `
CREATE OR REPLACE FUNCTION public.feed_post_from_history()
 RETURNS trigger LANGUAGE plpgsql
AS $function$
begin
  if tg_op = 'DELETE' then
    -- table reference corrected from public.journal to public.history
    if not exists (
      select 1 from public.history
      where user_id = old.user_id and tmdb_id = old.tmdb_id
    ) then
      delete from public.feed_posts where author_id = old.user_id;
    end if;
    return old;
  end if;
  insert into public.feed_posts (author_id, source_type, tmdb_id, media_type, title)
    values (new.user_id, 'watch', new.tmdb_id, new.media_type, new.title)
  on conflict (author_id, source_type, tmdb_id, media_type) do update
    set title = excluded.title;
  return new;
end;
$function$`;

// What production actually has on feed_posts.
const CONSTRAINTS = new Map([
  ['feed_posts', [
    { name: 'feed_posts_pkey', key: 'id' },
    { name: 'feed_posts_author_type_title_key', key: colKey('author_id,source_type,tmdb_id,media_type') },
  ]],
]);

test('colKey is order-independent and case/quote insensitive', () => {
  assert.equal(colKey('b, A ,c'), 'a,b,c');
  assert.equal(colKey('"Author_Id", tmdb_id'), 'author_id,tmdb_id');
  assert.equal(colKey(''), '');
  assert.equal(colKey(undefined), '');
});

test('the outage definition is flagged: its conflict target resolves to nothing', () => {
  const [target] = resolveConflictTargets(BROKEN, CONSTRAINTS);
  assert.equal(target.table, 'feed_posts');
  assert.equal(target.key, 'author_id,media_type,tmdb_id');
  assert.equal(target.matched, null, 'the 3-column target must NOT match any constraint');
});

test('the fixed definition passes: its conflict target matches the real constraint', () => {
  const [target] = resolveConflictTargets(FIXED, CONSTRAINTS);
  assert.equal(target.key, 'author_id,media_type,source_type,tmdb_id');
  assert.equal(target.matched, 'feed_posts_author_type_title_key');
});

test('the outage definition is flagged for referencing the renamed table', () => {
  assert.ok(extractTableRefs(BROKEN).includes('journal'), 'should see public.journal');
  assert.ok(!extractTableRefs(BROKEN).includes('history'));
});

test('a comment mentioning the old table name is not a false positive', () => {
  const refs = extractTableRefs(FIXED);
  assert.ok(refs.includes('history'), 'should see public.history');
  assert.ok(!refs.includes('journal'), 'the explanatory comment must not count as a reference');
});

test('extractConflictTargets finds every clause, not just the first', () => {
  const two = `
    insert into public.a (x) values (1) on conflict (x) do nothing;
    insert into public.b (y) values (2) on conflict (y, z) do nothing;`;
  assert.deepEqual(extractConflictTargets(two), [
    { table: 'a', key: 'x' },
    { table: 'b', key: 'y,z' },
  ]);
});

test('a function with no upsert yields nothing to check', () => {
  const plain = `begin update public.profiles set x = 1; return new; end;`;
  assert.deepEqual(extractConflictTargets(plain), []);
});

/* ── The same failure in application code ─────────────────────────────────── */

// The real web import, before and after. 20260727010000 replaced history's
// (user_id, tmdb_id, watched_at) constraint with one including media_type; the
// import kept naming the old one, so every batch answered 42P10 and wrote
// nothing while reporting the rows as imported.
const APP_BROKEN = `
  const { error } = await supabase
    .from('history')
    .upsert(batch, { onConflict: 'user_id,tmdb_id,watched_at' });`;

const APP_FIXED = `
  export const HISTORY_CONFLICT_TARGET = 'user_id,tmdb_id,media_type,watched_at';
  const { error } = await supabase
    .from('history')
    .upsert(batch, { onConflict: HISTORY_CONFLICT_TARGET });`;

test('the stale application target is flagged', () => {
  const [target] = extractAppConflictTargets(APP_BROKEN);
  assert.equal(target.table, 'history');
  assert.equal(target.key, 'tmdb_id,user_id,watched_at');
});

test('a target written as a shared constant is resolved, not skipped', () => {
  const constants = extractStringConstants(APP_FIXED);
  assert.equal(constants.get('HISTORY_CONFLICT_TARGET'), 'user_id,tmdb_id,media_type,watched_at');
  const [target] = extractAppConflictTargets(APP_FIXED, constants);
  assert.equal(target.key, 'media_type,tmdb_id,user_id,watched_at');
});

test('an unresolvable target is reported as unknown rather than guessed', () => {
  const [target] = extractAppConflictTargets(APP_FIXED);
  assert.equal(target.key, null, 'no constants supplied, so nothing to resolve');
  assert.equal(target.raw, 'HISTORY_CONFLICT_TARGET');
});

test('a later statement is not mistaken for this one\'s conflict target', () => {
  const source = `
    await supabase.from('history').delete().eq('user_id', userId);
    await supabase.from('list_items').upsert(rows, { onConflict: 'list_id,tmdb_id' });`;
  assert.deepEqual(extractAppConflictTargets(source), [
    { table: 'list_items', key: 'list_id,tmdb_id', raw: 'list_id,tmdb_id' },
  ]);
});

test('reads with no upsert yield nothing to check', () => {
  const source = `const { data } = await supabase.from('history').select('tmdb_id').eq('user_id', id);`;
  assert.deepEqual(extractAppConflictTargets(source), []);
});

/* ── Migrations that have not run yet ─────────────────────────────────────── */

// The real pair from 2026-08-06: one migration swaps history's unique key while
// the code that names it changes in the same branch. Checked against the live
// schema alone, every one of those call sites fails until the merge applies it.

const SWAP_KEY = `
-- Remove rewatch logging: one history row per title, always.
-- Reverts 20260725000001. Nothing here touches feed_post_from_history().
alter table public.history
  drop constraint if exists history_user_id_tmdb_id_media_type_watched_at_key;

alter table public.history
  add constraint history_user_id_tmdb_id_media_type_key
  unique (user_id, tmdb_id, media_type);`;

const ADD_INDEX = `
create unique index if not exists lists_user_id_name_key
  on public.lists (user_id, name);`;

const LIVE = () => new Map([
  ['history', [
    { name: 'history_pkey', key: 'id' },
    { name: 'history_user_id_tmdb_id_media_type_watched_at_key', key: colKey('user_id,tmdb_id,media_type,watched_at') },
  ]],
  ['lists', [{ name: 'lists_pkey', key: 'id' }]],
]);

test('a key swap is read as both a drop and an add', () => {
  const { adds, drops } = extractMigrationKeyChanges(SWAP_KEY);
  assert.deepEqual(drops, ['history_user_id_tmdb_id_media_type_watched_at_key']);
  assert.deepEqual(adds, [{
    table: 'history',
    name: 'history_user_id_tmdb_id_media_type_key',
    key: 'media_type,tmdb_id,user_id',
  }]);
});

test('a unique index counts as a key, the same as a constraint', () => {
  const { adds } = extractMigrationKeyChanges(ADD_INDEX);
  assert.deepEqual(adds, [{ table: 'lists', name: 'lists_user_id_name_key', key: 'name,user_id' }]);
});

test('a CHECK constraint is not a key and never satisfies ON CONFLICT', () => {
  const sql = `alter table public.marketing_posts
                 add constraint marketing_posts_status_check check (status in ('draft','approved'));`;
  assert.deepEqual(extractMigrationKeyChanges(sql).adds, []);
});

test('a migration describing a constraint in prose does not declare one', () => {
  // Migrations in this repo explain themselves at length, and name constraints
  // while doing it. Comments are not DDL.
  const sql = `
    -- add constraint history_fake_key unique (a, b) would be wrong because …
    /* drop constraint history_pkey is also discussed here */
    select 1;`;
  assert.deepEqual(extractMigrationKeyChanges(sql), { adds: [], drops: [] });
});

test('dynamic DDL is left alone rather than guessed at', () => {
  const sql = `loop execute format('alter table public.feed_posts drop constraint %I', r.conname); end loop;`;
  assert.deepEqual(extractMigrationKeyChanges(sql).drops, []);
});

test('several add-constraint clauses attach to their own alter table', () => {
  const sql = `
    alter table public.a add constraint a_key unique (x);
    alter table public.b add constraint b_key unique (y);`;
  assert.deepEqual(extractMigrationKeyChanges(sql).adds, [
    { table: 'a', name: 'a_key', key: 'x' },
    { table: 'b', name: 'b_key', key: 'y' },
  ]);
});

test('the swapped-in key resolves, and says which migration owes it', () => {
  const projected = projectPendingSchema(LIVE(), [{ file: '20260806000001_remove_rewatch_logging.sql', sql: SWAP_KEY }]);
  const match = projected.get('history').find(c => c.key === colKey('user_id,tmdb_id,media_type'));
  assert.ok(match, 'the new key must resolve before the migration applies');
  assert.equal(match.pending, '20260806000001_remove_rewatch_logging.sql');
});

test('the swapped-out key stops resolving, so code still naming it fails', () => {
  const projected = projectPendingSchema(LIVE(), [{ file: 'swap.sql', sql: SWAP_KEY }]);
  const gone = projected.get('history').find(c => c.key === colKey('user_id,tmdb_id,media_type,watched_at'));
  assert.equal(gone, undefined, 'a dropped key must not keep resolving');
});

test('a live constraint the branch does not touch is untouched', () => {
  const projected = projectPendingSchema(LIVE(), [{ file: 'swap.sql', sql: SWAP_KEY }]);
  assert.ok(projected.get('history').some(c => c.name === 'history_pkey'));
  assert.ok(projected.get('lists').some(c => c.name === 'lists_pkey'));
});

test('with nothing pending the live schema is passed through unchanged', () => {
  const live = LIVE();
  const projected = projectPendingSchema(live, []);
  assert.deepEqual([...projected.get('history')], [...live.get('history')]);
  assert.ok([...projected.get('history')].every(c => c.pending === undefined));
});

test('projecting does not mutate the live schema it was given', () => {
  // The failure report lists what the table offers *today*, so the live map has
  // to survive projection intact or that advice becomes fiction.
  const live = LIVE();
  projectPendingSchema(live, [{ file: 'swap.sql', sql: SWAP_KEY }]);
  assert.equal(live.get('history').length, 2);
  assert.ok(live.get('history').some(c => c.name === 'history_user_id_tmdb_id_media_type_watched_at_key'));
});

test('a table created by a pending migration resolves too', () => {
  const projected = projectPendingSchema(LIVE(), [{ file: 'new.sql', sql: ADD_INDEX }]);
  assert.equal(projected.get('lists').find(c => c.key === 'name,user_id').pending, 'new.sql');
});
