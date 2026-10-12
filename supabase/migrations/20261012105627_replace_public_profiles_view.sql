-- Keep the public profile API while removing its owner-run view. The profiles
-- table contains private fields and its owner-only SELECT policy must stay.
-- This table holds only the six fields already exposed by the view. RLS applies
-- to every read, including the viewer-specific block rule.

drop view public.public_profiles;

create table public.public_profiles (
  id uuid primary key references public.profiles(id) on delete cascade,
  username text,
  display_name text,
  avatar_url text,
  is_premium boolean,
  is_supporter boolean not null
);

create index public_profiles_username_idx on public.public_profiles (username);

alter table public.public_profiles enable row level security;

create policy "visible public profiles are readable" on public.public_profiles
  for select to anon, authenticated
  using (public.not_blocked(id));

-- The project's default relation privileges include writes. Explicitly
-- remove them so the API cannot modify this projection directly.
revoke all on public.public_profiles from public, anon, authenticated;
grant select on public.public_profiles to anon, authenticated;

insert into public.public_profiles
  (id, username, display_name, avatar_url, is_premium, is_supporter)
select id, username, display_name, avatar_url, is_premium, is_supporter
from public.profiles
where is_public = true;

create function public.sync_public_profile_projection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_public = true then
    insert into public.public_profiles
      (id, username, display_name, avatar_url, is_premium, is_supporter)
    values
      (new.id, new.username, new.display_name, new.avatar_url, new.is_premium, new.is_supporter)
    on conflict (id) do update set
      username = excluded.username,
      display_name = excluded.display_name,
      avatar_url = excluded.avatar_url,
      is_premium = excluded.is_premium,
      is_supporter = excluded.is_supporter;
  else
    delete from public.public_profiles where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_public_profile_projection() from public, anon, authenticated;

create trigger sync_public_profile_projection
  after insert or update of username, display_name, avatar_url,
    is_premium, is_supporter, is_public
  on public.profiles
  for each row execute function public.sync_public_profile_projection();

comment on table public.public_profiles is
  'Public-only profile projection, synchronized from profiles. RLS hides blocked users; direct writes are reserved for the trigger.';

-- Catch privilege drift during migration rather than relying on the advisor.
do $guard$
declare
  r text;
  p text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if not has_table_privilege(r, 'public.public_profiles', 'select') then
      raise exception '% cannot read public.public_profiles', r;
    end if;
    foreach p in array array['insert', 'update', 'delete', 'truncate'] loop
      if has_table_privilege(r, 'public.public_profiles', p) then
        raise exception '% still has % on public.public_profiles', r, p;
      end if;
    end loop;
  end loop;
end
$guard$;
