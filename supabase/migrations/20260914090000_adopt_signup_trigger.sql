-- Put the signup trigger under version control.
--
-- `public.handle_new_user()` and `on_auth_user_created` are what turn a row in
-- `auth.users` into a row in `public.profiles`. Every account PLOT has depends
-- on them, and until this migration neither existed anywhere in this repo: both
-- were created by hand through the Supabase dashboard's SQL editor and have
-- never been reviewed, diffed, or restorable from source.
--
-- Found on 2026-09-13 while classifying identity functions for
-- `npm run db:block-clause`. That check reads the latest definition of every
-- function across all migrations, and `handle_new_user` simply was not there to
-- classify — not stale, not dropped, absent.
--
-- Two things were wrong with that, and this migration fixes the second:
--
--   1. Nothing could see it. `db:function-diff` compares live bodies against
--      what the migrations produce, and a function no migration mentions is
--      invisible to it. If a dashboard edit had broken signup, no gate in this
--      repo would have said so.
--   2. Nothing could rebuild it. A database built from `supabase/migrations`
--      alone gets no trigger, so `auth.users` fills up and `public.profiles`
--      stays empty — every signup "succeeds" and every one of those accounts is
--      profile-less. Watched happen, and then watched stop happening, in a
--      throwaway copy of production on 2026-09-13.
--
-- WHAT THIS IS NOT
-- This is an adoption, not a change. The body below is byte-for-byte `prosrc`
-- as read from production on 2026-09-13 — md5 b5b61f66378322980191240bd947daca,
-- 327 bytes, trailing whitespace and shouty SQL included.
--
-- Copying it verbatim rather than tidying it is the point. Postgres stores the
-- body as text, so a reformat is a real write: retyping these six lines in this
-- repo's lowercase idiom made `npm run db:function-diff` report seven lines
-- removed from a live function body, which is the exact signature of the July
-- 2026 outage it exists to catch. An adoption that changes nothing should print
-- nothing. It now does. Tidy it in a later migration if it grates, and let the
-- diff say so out loud.
--
-- Resisted for the same reason: adding `on conflict (id) do nothing`. It looks
-- free, but it would mean this migration changed behaviour under cover of a
-- cleanup — and the failure it papers over (a profile row already existing for a
-- brand new auth.users id) is one worth hearing about rather than swallowing.
--
-- THE TRIGGER IS GUARDED, THE FUNCTION IS NOT
-- `create or replace function` asserts the body: after this runs, the migrations
-- are the source of truth for what signup does, which is the whole point. The
-- trigger is created only when absent, because `drop trigger` + `create trigger`
-- takes an ACCESS EXCLUSIVE lock on `auth.users` to arrive at the state
-- production is already in. On production this whole file is a no-op; on a
-- rebuild it is the difference between having profiles and not.
--
-- WHAT THIS DOES NOT CLOSE
-- `profiles`, `history`, `lists`, `list_items` and `feedback` predate
-- `supabase/migrations/` (which starts 2026-03-25) and are created by no
-- migration either, so a build from zero still cannot get off the ground. That
-- is a baseline-schema job, tracked separately. This file makes the signup path
-- reviewable and restorable once a baseline exists; it does not invent one.
--
-- `notify_new_signup` — the other trigger on `auth.users` — is deliberately NOT
-- adopted here. It is out of migrations on purpose, with its reasons recorded in
-- supabase/notify-signup-trigger.sql: it depends on a Vault secret and would
-- double-send if a dashboard webhook were also configured.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$                                                                                                               
  BEGIN
    INSERT INTO public.profiles (id)                                                                                  
    VALUES (new.id);                                          
    RETURN new;
  END;
  $$;

do $guard$
begin
  if exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'auth'
      and c.relname = 'users'
      and t.tgname = 'on_auth_user_created'
      and not t.tgisinternal
  ) then
    raise notice 'on_auth_user_created already exists on auth.users; leaving it alone';
  else
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
    raise notice 'created on_auth_user_created on auth.users';
  end if;
end
$guard$;
