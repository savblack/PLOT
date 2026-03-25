create table if not exists follows (
  follower_id  uuid references auth.users(id) on delete cascade not null,
  following_id uuid references auth.users(id) on delete cascade not null,
  created_at   timestamptz default now() not null,
  primary key (follower_id, following_id)
);

create index if not exists follows_following_id_idx on follows(following_id);

alter table follows enable row level security;

create policy "follows are publicly readable"
  on follows for select using (true);

create policy "users can follow others"
  on follows for insert
  with check (auth.uid() = follower_id);

create policy "users can unfollow"
  on follows for delete
  using (auth.uid() = follower_id);
