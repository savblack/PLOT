-- Customisable public-profile sections.
--
-- `profile_sections` is the ordered list of content rails a user chooses to
-- show on their profile (from: 'recent', 'topMovies', 'topTv', 'favourites').
-- NULL means "show everything" — the default, and backward-compatible with
-- every existing profile.

alter table public.profiles
  add column if not exists profile_sections text[] default null;

-- get_profile_card must return the preference so it applies for EVERY viewer,
-- not just the owner (the profile page reads its header from this RPC).
drop function if exists public.get_profile_card(text);
create function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text,
               profile_sections text[])
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid()),
         p.profile_sections
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
$$;
grant execute on function public.get_profile_card(text) to anon, authenticated;
