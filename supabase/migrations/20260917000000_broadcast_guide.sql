-- Separate broadcast IDs from legacy TMDB streaming-provider selections.
create table public.broadcast_preferences (
  user_id uuid references auth.users(id) on delete cascade,
  market_id text not null check (length(market_id) between 1 and 100),
  channel_ids text[] check (cardinality(channel_ids) <= 200)
);
alter table public.broadcast_preferences
  add constraint broadcast_preferences_pkey primary key (user_id);
alter table public.broadcast_preferences enable row level security;
grant select, insert, update, delete on public.broadcast_preferences to authenticated;
create policy "Own broadcast preferences" on public.broadcast_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Public schedule data only. No client write policies: the scheduled importer
-- writes through the service role. Personal preferences never enter this bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('broadcast-guide', 'broadcast-guide', true, 10000000, array['application/json']);
