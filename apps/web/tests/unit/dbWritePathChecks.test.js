import test from 'node:test';
import assert from 'node:assert/strict';
import {
  colKey, extractConflictTargets, extractTableRefs, resolveConflictTargets,
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
