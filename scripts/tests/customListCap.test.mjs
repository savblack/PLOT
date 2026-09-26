// Isolated PostgreSQL integration proof with synthetic data only. No Supabase access.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const exec = promisify(execFile);
test('five-list cap: RLS, bulk inserts, concurrent requests and existing-list access', async () => {
  const dir = await mkdtemp('/tmp/plot-cap-');
  const env = { ...process.env, PATH: `/opt/homebrew/opt/postgresql@17/bin:${process.env.PATH}`, LC_ALL: 'C', LANG: 'C', PGHOST: dir, PGPORT: '55441', PGUSER: 'postgres', PGDATABASE: 'postgres' };
  const run = (bin, args) => exec(bin, args, { env });
  const sql = query => run('psql', ['-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', query]);
  const owner = '00000000-0000-4000-8000-000000000001';
  const asOwner = `set role authenticated; set request.jwt.claim.sub = '${owner}';`;
  const insert = name => `insert into user_custom_lists(user_id,name) values ('${owner}','${name}');`;
  let started = false;
  try {
    await run('initdb', ['-D', `${dir}/data`, '-U', 'postgres', '--auth=trust']);
    await run('pg_ctl', ['-D', `${dir}/data`, '-l', `${dir}/server.log`, '-o', `-k ${dir} -p 55441 -c listen_addresses=''`, '-w', 'start']);
    started = true;
    await sql(`create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create function public.is_premium() returns boolean language sql stable as $$ select coalesce(current_setting('test.premium',true),'') = 'true' $$;
      create table user_custom_lists(id uuid primary key default gen_random_uuid(), user_id uuid not null, name text not null);
      grant usage on schema public, auth to authenticated;
      grant all on user_custom_lists to authenticated;
      alter table user_custom_lists enable row level security;`);
    for (const file of ['20260916140000_free_list_allowance.sql', '20260916180000_serialize_custom_list_creation.sql']) {
      await run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', resolve('supabase/migrations', file)]);
    }
    await sql(`create policy list_read on user_custom_lists for select using (user_id = auth.uid());
      create policy list_update on user_custom_lists for update using (user_id = auth.uid()) with check(user_id = auth.uid());
      create policy list_delete on user_custom_lists for delete using (user_id = auth.uid());
      create policy list_create on user_custom_lists for insert with check (user_id = auth.uid() and can_create_custom_list());`);
    await sql(`${asOwner} insert into user_custom_lists(user_id,name) select '${owner}', 'List ' || n from generate_series(1,5) n;`);
    await assert.rejects(sql(`${asOwner}${insert('Sixth')}`), /custom_list_limit_reached/);
    await sql(`${asOwner} update user_custom_lists set name='Renamed' where name='List 1'; delete from user_custom_lists where name='List 2'; ${insert('Replacement')}`);
    assert.equal((await sql('select count(*) from user_custom_lists')).stdout.trim(), '5');
    await assert.rejects(sql(`${asOwner} insert into user_custom_lists(user_id,name) values ('00000000-0000-4000-8000-000000000002','Other owner');`), /row-level security/);
    await sql(`${asOwner} set test.premium='true'; ${insert('Premium sixth')}`);
    await assert.rejects(sql(`${asOwner}${insert('After expiry')}`), /custom_list_limit_reached/);
    await sql(`${asOwner} update user_custom_lists set name='Still editable' where name='Premium sixth';`);
    assert.equal((await sql(`${asOwner} select count(*) from user_custom_lists;`)).stdout.trim().split('\n').at(-1), '6');
    await sql('truncate user_custom_lists;');
    await assert.rejects(sql(`${asOwner} insert into user_custom_lists(user_id,name) select '${owner}', 'Bulk ' || n from generate_series(1,6) n;`), /custom_list_limit_reached/);
    assert.equal((await sql('select count(*) from user_custom_lists')).stdout.trim(), '0');
    await sql(`${asOwner} insert into user_custom_lists(user_id,name) select '${owner}', 'List ' || n from generate_series(1,4) n;`);
    const results = await Promise.allSettled([
      sql(`begin; ${asOwner}${insert('Parallel A')} select pg_sleep(0.3); commit;`),
      sql(`begin; ${asOwner}${insert('Parallel B')} select pg_sleep(0.3); commit;`),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(results.find(result => result.status === 'rejected').reason.message, /custom_list_limit_reached/);
    assert.equal((await sql('select count(*) from user_custom_lists')).stdout.trim(), '5');
  } finally {
    if (started) await run('pg_ctl', ['-D', `${dir}/data`, '-m', 'immediate', '-w', 'stop']);
    await rm(dir, { recursive: true, force: true });
  }
});
