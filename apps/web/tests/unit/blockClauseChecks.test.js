import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractFunctionStatements, latestDefinitions, readsProfiles, hasBlockClause, checkBlockClause,
} from '../../../../scripts/lib/blockClauseChecks.mjs';

// A guard nobody has watched fail is not a guard. The failure this one exists
// to catch leaves nothing behind — no error, no log line, just a blocked
// account quietly visible again on one surface — so the only way to know it
// works is to build that exact state here and watch it fail.

const GUARDED = `
create or replace function public.search_users(p_query text)
returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username
  from public.profiles p
  where p.username ilike trim(p_query) || '%'
    and public.not_blocked(p.id)
$$;
`;

// Byte-for-byte the same function with the clause gone: what a `create or
// replace` written from a stale body produces.
const STALE_REDEFINITION = `
create or replace function public.search_users(p_query text)
returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username
  from public.profiles p
  where p.username ilike trim(p_query) || '%'
$$;
`;

const EXEMPT = `
create or replace function public.username_available(p_username text)
returns boolean language sql stable security definer as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username))
$$;
`;

const base = () => latestDefinitions([
  { file: '20260101000000_a.sql', sql: GUARDED },
  { file: '20260102000000_b.sql', sql: EXEMPT },
]);

const run = (latest, filtered = ['search_users'], exempt = ['username_available']) =>
  checkBlockClause({ latest, filtered, exempt });

const codes = result => result.failures.map(f => f.code);

test('a correctly guarded set passes', () => {
  const result = run(base());
  assert.equal(result.ok, true);
  assert.deepEqual(result.failures, []);
});

test('the July shape: a later migration recreates the function without the clause', () => {
  const latest = latestDefinitions([
    { file: '20260101000000_a.sql', sql: GUARDED },
    { file: '20260102000000_b.sql', sql: EXEMPT },
    // Unrelated fix, written from the body the author remembered.
    { file: '20260301000000_unrelated_fix.sql', sql: STALE_REDEFINITION },
  ]);
  const result = run(latest);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['missing-clause']);
  assert.deepEqual(result.failures[0].names, ['search_users']);
  // And it names the file that did it, which is the whole point.
  assert.equal(latest.get('search_users').file, '20260301000000_unrelated_fix.sql');
});

test('a new identity function nobody classified is unclassified, not silently allowed', () => {
  const latest = latestDefinitions([
    { file: '20260101000000_a.sql', sql: GUARDED },
    { file: '20260102000000_b.sql', sql: EXEMPT },
    {
      file: '20260401000000_mutuals.sql',
      sql: `
create or replace function public.list_mutuals(p_target uuid)
returns table (id uuid) language sql stable security definer as $$
  select p.id from public.profiles p join public.follows f on f.follower_id = p.id
$$;`,
    },
  ]);
  const result = run(latest);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['unclassified']);
  assert.deepEqual(result.failures[0].names, ['list_mutuals']);
});

test('a function that never touches profiles is not the guard\'s business', () => {
  const latest = latestDefinitions([
    { file: '20260101000000_a.sql', sql: GUARDED },
    { file: '20260102000000_b.sql', sql: EXEMPT },
    {
      file: '20260401000000_counter.sql',
      sql: `
create or replace function public.bump_counter() returns void language sql as $$
  update public.counters set n = n + 1
$$;`,
    },
  ]);
  assert.equal(run(latest).ok, true);
});

test('a stale entry naming a function no migration defines is flagged', () => {
  const result = run(base(), ['search_users', 'search_users_v2']);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['unknown']);
  assert.deepEqual(result.failures[0].names, ['search_users_v2']);
});

test('the two lists must be disjoint', () => {
  const result = run(base(), ['search_users', 'username_available'], ['username_available']);
  assert.equal(result.ok, false);
  assert.ok(codes(result).includes('overlap'));
});

test('an exempt function that grows a block clause is flagged', () => {
  const latest = latestDefinitions([
    { file: '20260101000000_a.sql', sql: GUARDED },
    {
      file: '20260102000000_b.sql',
      sql: EXEMPT.replace(
        'where lower(username) = lower(p_username)',
        'where lower(username) = lower(p_username) and public.not_blocked(id)',
      ),
    },
  ]);
  const result = run(latest);
  assert.equal(result.ok, false);
  assert.deepEqual(codes(result), ['unexpected-clause']);
  assert.deepEqual(result.failures[0].names, ['username_available']);
});

test('the latest definition wins, and a drop removes the function entirely', () => {
  const latest = latestDefinitions([
    { file: '20260101000000_a.sql', sql: GUARDED },
    { file: '20260102000000_b.sql', sql: 'drop function if exists public.search_users(text);' },
  ]);
  assert.equal(latest.has('search_users'), false);
  // And the guard then says the list is stale rather than passing on absence.
  assert.deepEqual(codes(run(latest, ['search_users'], [])), ['unknown']);
});

test('a $$ inside a $function$ body does not end it early', () => {
  const [stmt] = extractFunctionStatements(`
create or replace function public.get_profile_card(p_username text)
returns table (id uuid) language sql stable security definer as $function$
  select p.id from public.profiles p
  where p.bio <> '$$' and public.not_blocked(p.id)
$function$;`);
  assert.equal(stmt.name, 'get_profile_card');
  assert.equal(hasBlockClause(stmt.body), true);
  assert.equal(readsProfiles(stmt.body), true);
});

test('readsProfiles matches reads, not the word appearing in a comment', () => {
  assert.equal(readsProfiles('select 1 from public.profiles p'), true);
  assert.equal(readsProfiles('select 1 from profiles'), true);
  assert.equal(readsProfiles('join public.profiles p on p.id = n.actor_id'), true);
  assert.equal(readsProfiles('-- mirrors a column into the profiles table\nselect 1'), false);
});
