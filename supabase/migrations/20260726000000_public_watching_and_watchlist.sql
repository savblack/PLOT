-- Expose Watching and Want to Watch on public profiles, matching the existing
-- pattern for user_top_lists / user_favourites (public.is_profile_public()).

drop policy if exists "public profiles watching progress readable" on public.watching_progress;
create policy "public profiles watching progress readable" on public.watching_progress
  for select to anon, authenticated using (public.is_profile_public(user_id));

drop policy if exists "public profiles list items readable" on public.list_items;
create policy "public profiles list items readable" on public.list_items
  for select to anon, authenticated using (public.is_profile_public(user_id));
