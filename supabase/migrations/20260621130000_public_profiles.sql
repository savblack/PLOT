-- Public profiles: safe identity + opt-in visibility.
--
-- Builds on scaffolding already live in prod (profiles.username, profiles.display_name,
-- profiles.is_public default false, and a public-read policy on journal). This migration:
--   1. Adds username auto-generation, uniqueness, and a backfill.
--   2. Closes an existing leak: profiles was anon-readable via USING(true), exposing every
--      column including calendar_token. We replace it with owner-only read + a safe view.
--   3. Decouples public content visibility from profiles RLS via a SECURITY DEFINER helper,
--      so the journal/lists public-read policies don't depend on profiles being anon-readable.

create extension if not exists citext;

-- ── 1. Username: auto-generation, uniqueness, backfill ──────────────────────────────

-- Generate a unique, URL-safe username from a seed (email or uuid). SECURITY DEFINER so
-- it can read profiles for the uniqueness check regardless of caller.
create or replace function public.generate_username(p_seed text)
returns text language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  n int := 1;
begin
  base := lower(coalesce(split_part(p_seed, '@', 1), ''));
  base := regexp_replace(base, '[^a-z0-9]+', '-', 'g');
  base := trim(both '-' from base);
  if length(base) < 3 then
    base := 'user';
  end if;
  base := trim(both '-' from left(base, 24));
  candidate := base;
  while exists (select 1 from public.profiles where lower(username) = lower(candidate)) loop
    n := n + 1;
    candidate := trim(both '-' from left(base, 22)) || '-' || n::text;
  end loop;
  return candidate;
end;
$$;

-- Auto-assign a username on profile creation when the client doesn't supply one
-- (the onboarding upsert doesn't pass email, so we read it server-side here).
create or replace function public.set_username_on_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if new.username is null or length(trim(new.username)) = 0 then
    select email into v_email from auth.users where id = new.id;
    new.username := public.generate_username(coalesce(v_email, new.id::text));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_username on public.profiles;
create trigger trg_set_username before insert on public.profiles
  for each row execute function public.set_username_on_insert();

-- Backfill existing rows that have no username.
do $$
declare
  r record;
  v_email text;
begin
  for r in select id from public.profiles where username is null or length(trim(username)) = 0 loop
    select email into v_email from auth.users where id = r.id;
    update public.profiles set username = public.generate_username(coalesce(v_email, r.id::text)) where id = r.id;
  end loop;
end $$;

create unique index if not exists profiles_username_lower_key on public.profiles (lower(username));

-- Case-insensitive availability check for the settings UI.
create or replace function public.username_available(p_username text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(p_username))
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- ── 2. Lock down profiles + expose only safe public columns ─────────────────────────

-- The app previously read even the logged-in user's own profile through the over-broad
-- public policy. Add an explicit owner-read policy first so nothing breaks.
drop policy if exists "users can read own profile" on public.profiles;
create policy "users can read own profile" on public.profiles
  for select to authenticated using (auth.uid() = id);

-- Remove the over-broad public read (it exposed calendar_token, region, etc. to anon).
drop policy if exists "profiles are publicly readable" on public.profiles;

-- Safe, public-only projection. security_invoker=off → runs as the view owner and bypasses
-- profiles RLS, but only ever exposes these columns for opted-in (is_public) profiles.
drop view if exists public.public_profiles;
create view public.public_profiles with (security_invoker = off) as
  select id, username, display_name, avatar_url, is_supporter
  from public.profiles
  where is_public = true;
grant select on public.public_profiles to anon, authenticated;

-- ── 3. Decouple public content visibility from profiles RLS ─────────────────────────

create or replace function public.is_profile_public(p_uid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_public from public.profiles where id = p_uid), false)
$$;
grant execute on function public.is_profile_public(uuid) to anon, authenticated;

-- Rewrite the existing journal public-read policy: the old version did an inline EXISTS
-- into profiles, which no longer works now that profiles isn't anon-readable.
drop policy if exists "public profiles journal is readable" on public.journal;
create policy "public profiles journal is readable" on public.journal
  for select to anon, authenticated using (public.is_profile_public(user_id));

-- Expose the curated public lists (Top 10 + favourites) for opted-in profiles.
drop policy if exists "public profiles top lists readable" on public.user_top_lists;
create policy "public profiles top lists readable" on public.user_top_lists
  for select to anon, authenticated using (public.is_profile_public(user_id));

drop policy if exists "public profiles favourites readable" on public.user_favourites;
create policy "public profiles favourites readable" on public.user_favourites
  for select to anon, authenticated using (public.is_profile_public(user_id));
