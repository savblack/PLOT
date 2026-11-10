import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { extractConflictTargets } from '../lib/dbWritePathChecks.mjs';

const exec = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const readFromRoot = (path) => readFile(join(root, path), 'utf8');
const firstMigrationPath = 'supabase/migrations/20261102120000_title_page_index_seen_throttle.sql';
// The live body: 20261110120000 widened the refresh window from 24 hours to 7 days.
const migrationPath = 'supabase/migrations/20261110120000_db_load_trim.sql';

test('title index write is a conditional upsert and stays off the page response', async () => {
  const [migration, page] = await Promise.all([
    readFromRoot(migrationPath),
    readFromRoot('supabase/functions/title-page/index.ts'),
  ]);

  assert.deepEqual(extractConflictTargets(migration), [
    { table: 'title_page_index', key: 'media_type,tmdb_id' },
  ]);
  assert.match(migration, /last_seen_at < now\(\) - interval '7 days'/);
  assert.match(migration, /title is distinct from excluded\.title/);
  assert.match(migration, /revoke all on function public\.record_title_page_index\(jsonb\) from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.record_title_page_index\(jsonb\) to service_role/);
  assert.doesNotMatch(migration, /\b(drop|alter) table\b/i);

  assert.match(page, /rpc\('record_title_page_index'/);
  assert.match(page, /runtime\.waitUntil\(promise\)/);
  assert.doesNotMatch(page, /from\('title_page_index'\)[\s\S]{0,240}upsert/);
});

const pgBin = ['/usr/lib/postgresql/17/bin', '/opt/homebrew/opt/postgresql@17/bin']
  .find((dir) => existsSync(join(dir, 'initdb')));

test('record_title_page_index inserts, then writes only when stale or renamed', { skip: pgBin ? false : 'PostgreSQL initdb is not installed' }, async () => {
  const dir = await mkdtemp(join(tmpdir(), 'plot-title-index-'));
  const env = {
    ...process.env,
    PATH: `${pgBin}:${process.env.PATH}`,
    LC_ALL: 'C',
    LANG: 'C',
    PGHOST: dir,
    PGPORT: '55447',
    PGUSER: 'postgres',
    PGDATABASE: 'postgres',
  };
  const run = (bin, args) => exec(bin, args, { env });
  const sql = (query) => run('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  const out = (query) => sql(query).then((result) => result.stdout.trim());
  const rows = () => out(`select media_type || ':' || tmdb_id || '|' || title || '|' || last_seen_at::text || '|' || ctid::text
    from public.title_page_index order by 1`);
  const snap = async () => new Map(String(await rows()).split('\n').filter(Boolean).map((line) => {
    const [key, title, seen, ctid] = line.split('|');
    return [key, { title, seen, ctid }];
  }));
  const stats = () => out(`select n_tup_ins || '|' || n_tup_upd || '|' || n_tup_hot_upd
    from pg_stat_user_tables where relname = 'title_page_index'`);
  const call = (payload) => out(`set role service_role; select public.record_title_page_index($json$${JSON.stringify(payload)}$json$::jsonb);`);
  let started = false;

  try {
    await run('initdb', ['-D', `${dir}/data`, '-U', 'postgres', '--auth=trust']);
    await run('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/server.log`, '-o', `-k ${dir} -p 55447 -c listen_addresses=''`, '-w', 'start']);
    started = true;
    await sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;`);
    await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'supabase/migrations/20261013180000_title_page_index.sql')]);
    await sql('grant select, insert, update on public.title_page_index to service_role;');
    await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, firstMigrationPath)]);
    await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, migrationPath)]);

    assert.equal(await out(`select has_function_privilege('anon', 'public.record_title_page_index(jsonb)', 'execute')`), 'f');
    assert.equal(await out(`select has_function_privilege('authenticated', 'public.record_title_page_index(jsonb)', 'execute')`), 'f');
    assert.equal(await out(`select has_function_privilege('service_role', 'public.record_title_page_index(jsonb)', 'execute')`), 't');
    await assert.rejects(
      sql(`set role anon; select public.record_title_page_index('[]'::jsonb);`),
      /permission denied/,
    );

    assert.equal(await call(null), '0');
    assert.equal(await out(`set role service_role; select public.record_title_page_index('{"media_type":"movie"}'::jsonb);`), '0');

    assert.equal(await call([
      { media_type: 'tv', tmdb_id: 7, title: 'First' },
      { media_type: 'tv', tmdb_id: 7, title: 'Second' },
      { media_type: 'person', tmdb_id: 8, title: 'No' },
      { media_type: 'movie', tmdb_id: 0, title: 'No' },
      { media_type: 'movie', tmdb_id: 8, title: 'Yes' },
    ]), '2');
    let seen = await snap();
    assert.equal(seen.get('tv:7').title, 'First');
    assert.equal(seen.get('movie:8').title, 'Yes');
    assert.equal(seen.size, 2);

    const inserted = await snap();
    const beforeRepeat = await stats();
    assert.equal(await call([{ media_type: 'tv', tmdb_id: 7, title: 'First' }]), '0');
    seen = await snap();
    assert.deepEqual(seen.get('tv:7'), inserted.get('tv:7'));
    assert.equal(await stats(), beforeRepeat);

    const fresh = seen.get('movie:8');
    assert.equal(await call([{ media_type: 'movie', tmdb_id: 8, title: 'Renamed' }]), '1');
    seen = await snap();
    assert.equal(seen.get('movie:8').title, 'Renamed');
    assert.notEqual(seen.get('movie:8').ctid, fresh.ctid);
    assert.notEqual(seen.get('movie:8').seen, fresh.seen);

    const boundary = await out(`set role service_role;
      update public.title_page_index set title = 'Edge', last_seen_at = now() - interval '7 days' where tmdb_id = 8;
      select ctid::text from public.title_page_index where tmdb_id = 8;
      select public.record_title_page_index($json$[{"media_type":"movie","tmdb_id":8,"title":"Edge"}]$json$::jsonb);
      select ctid::text from public.title_page_index where tmdb_id = 8;`);
    const [beforeCtid, wrote, afterCtid] = boundary.split('\n');
    assert.equal(wrote, '0');
    assert.equal(beforeCtid, afterCtid);

    const stale = await out(`set role service_role;
      update public.title_page_index set last_seen_at = now() - interval '8 days' where tmdb_id = 7;
      select ctid::text || '|' || last_seen_at::text from public.title_page_index where tmdb_id = 7;
      select public.record_title_page_index($json$[{"media_type":"tv","tmdb_id":7,"title":"First"}]$json$::jsonb);
      select ctid::text || '|' || last_seen_at::text from public.title_page_index where tmdb_id = 7;`);
    const [staleBefore, staleWrote, staleAfter] = stale.split('\n');
    assert.equal(staleWrote, '1');
    assert.notEqual(staleBefore.split('|')[0], staleAfter.split('|')[0]);
    assert.notEqual(staleBefore.split('|')[1], staleAfter.split('|')[1]);

    await call([
      { media_type: 'movie', tmdb_id: 101, title: 'Fresh' },
      { media_type: 'tv', tmdb_id: 102, title: 'Stale' },
      { media_type: 'movie', tmdb_id: 103, title: 'Old name' },
    ]);
    await sql(`update public.title_page_index set last_seen_at = now() - interval '8 days' where tmdb_id = 102;
      update public.title_page_index set last_seen_at = now() - interval '2 days' where tmdb_id in (101, 103);`);
    const batchBefore = await snap();
    const updatesBefore = Number((await stats()).split('|')[1]);
    assert.equal(await call([
      { media_type: 'movie', tmdb_id: 101, title: 'Fresh' },
      { media_type: 'tv', tmdb_id: 102, title: 'Stale' },
      { media_type: 'movie', tmdb_id: 103, title: 'New name' },
      { media_type: 'tv', tmdb_id: 104, title: 'Brand new' },
    ]), '3');
    seen = await snap();
    assert.deepEqual(seen.get('movie:101'), batchBefore.get('movie:101'));
    assert.equal(seen.get('tv:102').title, 'Stale');
    assert.notEqual(seen.get('tv:102').ctid, batchBefore.get('tv:102').ctid);
    assert.equal(seen.get('movie:103').title, 'New name');
    assert.equal(seen.get('tv:104').title, 'Brand new');
    const updatesAfter = Number((await stats()).split('|')[1]);
    assert.equal(updatesAfter - updatesBefore, 2);
  } finally {
    if (started) await run('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', '-w', 'stop']).catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
});
