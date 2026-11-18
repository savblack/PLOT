-- Prove protect_premium_flag() (20260913100000) survives the empty claims a
-- pooled backend carries, and still guards is_premium and is_supporter.
--
--   pnpm run staging:test -- premium-flag
--
-- Everything is in one transaction ending in rollback, so Staging is unchanged
-- whether this passes or dies. See
-- supabase/migrations/20260913100000_premium_flag_empty_claims.sql for why an
-- empty string ends up in request.jwt.claims in the first place.
\set ON_ERROR_STOP on
\set A '''467ce784-39eb-480e-8593-4632667fc9c3'''
begin;

\echo ''
\echo '=== empty claims ==='
set local request.jwt.claims = '';
do $$
begin
  update public.profiles set display_name = display_name where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'PASS  empty claims no longer break a profile write';
exception when others then
  raise notice 'FAIL  still broken: %', sqlerrm;
end $$;

-- And the protection it exists for must still hold.
set local request.jwt.claims = '{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}';
do $$
begin
  update public.profiles set is_premium = not is_premium where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'FAIL  a client just granted themselves premium';
exception when others then
  raise notice 'PASS  a client still cannot change is_premium (%)', sqlerrm;
end $$;

do $$
begin
  update public.profiles set is_supporter = not is_supporter where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'FAIL  a client just granted themselves supporter';
exception when others then
  raise notice 'PASS  a client still cannot change is_supporter (%)', sqlerrm;
end $$;

do $$
begin
  update public.profiles set display_name = 'renamed by the client' where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'PASS  a client can still change an ordinary column';
exception when others then
  raise notice 'FAIL  a client can no longer edit their own profile: %', sqlerrm;
end $$;

set local request.jwt.claims = '{"role":"service_role"}';
do $$
begin
  update public.profiles set is_premium = not is_premium where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'PASS  the service role can still change is_premium';
exception when others then
  raise notice 'FAIL  the service role can no longer change is_premium: %', sqlerrm;
end $$;

-- Non-empty and unparseable must fail CLOSED, not open.
set local request.jwt.claims = 'not json at all';
do $$
begin
  update public.profiles set is_premium = not is_premium where id = '467ce784-39eb-480e-8593-4632667fc9c3';
  raise notice 'FAIL  garbage claims granted premium (failed open)';
exception when others then
  raise notice 'PASS  garbage claims fail closed (%)', sqlerrm;
end $$;

-- 20261118140000: the same flags are guarded when a profile row is created.
-- A already has a row, so a guard-free insert would fail on the primary key
-- (23505). Seeing the guard's message instead proves the BEFORE INSERT guard
-- ran first; seeing 23505 for an ordinary insert proves it lets those through.
\echo ''
\echo '=== insert ==='
set local request.jwt.claims = '{"sub":"467ce784-39eb-480e-8593-4632667fc9c3","role":"authenticated"}';
set local role authenticated;
do $$
begin
  insert into public.profiles (id, is_premium) values ('467ce784-39eb-480e-8593-4632667fc9c3', true);
  raise notice 'FAIL  a client created a profile with is_premium set';
exception when others then
  if sqlerrm like '%can only be changed by billing%' then
    raise notice 'PASS  a client cannot create a profile with is_premium set';
  else
    raise notice 'FAIL  no insert guard for is_premium (got: %)', sqlerrm;
  end if;
end $$;

do $$
begin
  insert into public.profiles (id, is_supporter) values ('467ce784-39eb-480e-8593-4632667fc9c3', true);
  raise notice 'FAIL  a client created a profile with is_supporter set';
exception when others then
  if sqlerrm like '%Ko-fi webhook%' then
    raise notice 'PASS  a client cannot create a profile with is_supporter set';
  else
    raise notice 'FAIL  no insert guard for is_supporter (got: %)', sqlerrm;
  end if;
end $$;

do $$
begin
  insert into public.profiles (id, last_kofi_tip_at) values ('467ce784-39eb-480e-8593-4632667fc9c3', now());
  raise notice 'FAIL  a client created a profile with last_kofi_tip_at set';
exception when others then
  if sqlerrm like '%last_kofi_tip_at can only be changed%' then
    raise notice 'PASS  a client cannot create a profile with last_kofi_tip_at set';
  else
    raise notice 'FAIL  no insert guard for last_kofi_tip_at (got: %)', sqlerrm;
  end if;
end $$;

do $$
begin
  insert into public.profiles (id, display_name) values ('467ce784-39eb-480e-8593-4632667fc9c3', 'plain insert');
  raise notice 'FAIL  a duplicate profile row was created';
exception when unique_violation then
  raise notice 'PASS  an ordinary client insert passes the guard (reaches the primary key)';
when others then
  raise notice 'FAIL  the guard blocked an ordinary insert: %', sqlerrm;
end $$;
reset role;

-- Billing and the Ko-fi webhook run as service_role and must still pass.
set local request.jwt.claims = '{"role":"service_role"}';
do $$
begin
  insert into public.profiles (id, is_premium, is_supporter) values ('467ce784-39eb-480e-8593-4632667fc9c3', true, true);
  raise notice 'FAIL  a duplicate profile row was created';
exception when unique_violation then
  raise notice 'PASS  the service role can still create a profile with flags set (reaches the primary key)';
when others then
  raise notice 'FAIL  the insert guard blocked the service role: %', sqlerrm;
end $$;

rollback;
\echo ''
\echo 'rolled back — Staging is exactly as it was'
