-- Profile bio + fixed-set social/external links.
--
-- `links` is a jsonb object keyed by a fixed platform set (instagram, x,
-- tiktok, youtube, letterboxd, website) -> url string. Unknown keys are
-- ignored client-side; this keeps the schema to one column while the UI
-- still only offers a fixed, known platform list.

alter table public.profiles
  add column if not exists bio text,
  add column if not exists links jsonb default null;

alter table public.profiles
  add constraint profiles_bio_length check (bio is null or char_length(bio) <= 280);

-- get_profile_card is the single source of public-profile header data for
-- both web and mobile — bio/links must be added here to reach viewers.
drop function if exists public.get_profile_card(text);
create function public.get_profile_card(p_username text)
returns table (id uuid, username text, display_name text, avatar_url text,
               is_premium boolean, is_public boolean, follow_status text,
               profile_sections text[], bio text, links jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.display_name, p.avatar_url, p.is_premium,
         p.is_public,
         (select f.status from public.follows f
            where f.following_id = p.id and f.follower_id = auth.uid()),
         p.profile_sections, p.bio, p.links
  from public.profiles p
  where lower(p.username) = lower(p_username)
    and (p.is_public or auth.uid() is not null)
$$;
grant execute on function public.get_profile_card(text) to anon, authenticated;
