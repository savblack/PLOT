-- Collaborative lists redesign (PLO-525): the list-led invite landing.
-- Builds on 20261001140000_collaborative_list_invites.sql.
--
-- Once a list has titles, the invite landing leads with the list rather than
-- the person (canvas boards B3, B4 and B7): who else is on it and a peek at
-- a few of its posters. list_invite_preview() returns the owner and the title
-- count only, so this adds one read beside it rather than widening it.
--
-- Same gate as list_invite_preview: a valid key, and an owner the viewer has
-- not blocked or been blocked by. Readable signed out, because the person
-- opening the link may not have an account yet. Members the viewer has a
-- block with are left out of the names and the count. It returns a name
-- (the display name, or the username when there is none) and an avatar per
-- member, never a profile id, and at most three names and five posters.
--
-- Additive: one new function. Nothing existing is changed.

create or replace function public.list_invite_peek(p_key text)
returns table (member_count int, members jsonb, posters text[])
language sql stable security definer set search_path = public as $$
  with l as (
    select l.id
      from public.user_custom_list_invites k
      join public.user_custom_lists l on l.id = k.list_id
     where k.invite_key = p_key
       and public.not_blocked(l.user_id)
  ), m as (
    select p.display_name, p.username, p.avatar_url, mm.created_at
      from l
      join public.user_custom_list_members mm on mm.list_id = l.id
      join public.profiles p on p.id = mm.user_id
     where public.not_blocked(mm.user_id)
  )
  select (select count(*)::int from m),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'display_name', coalesce(x.display_name, x.username),
                    'avatar_url', x.avatar_url) order by x.created_at)
             from (select * from m order by created_at limit 3) x
         ), '[]'::jsonb),
         array(
           select i.poster_path
             from public.user_custom_list_items i
            where i.list_id = l.id and i.poster_path is not null
            order by i.added_at desc nulls last
            limit 5
         )
    from l
$$;

revoke all on function public.list_invite_peek(text) from public;
grant execute on function public.list_invite_peek(text) to anon, authenticated;
