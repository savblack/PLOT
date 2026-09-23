-- Live body inspected on 2026-09-16. Only the free allowance changes.
create or replace function public.can_create_custom_list()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select public.is_premium()
      or (select count(*) from public.user_custom_lists where user_id = auth.uid()) < 5;
$$;
