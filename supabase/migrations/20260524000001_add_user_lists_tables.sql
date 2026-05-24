-- Ranked Top 10 lists (movies + TV separately)
create table user_top_lists (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users not null,
  list_type   text not null check (list_type in ('movies', 'tv')),
  tmdb_id     integer not null,
  media_type  text not null check (media_type in ('movie', 'tv')),
  rank        integer not null check (rank >= 1 and rank <= 10),
  title       text not null,
  poster_path text,
  created_at  timestamptz default now(),
  unique (user_id, list_type, rank),
  unique (user_id, list_type, tmdb_id)
);

alter table user_top_lists enable row level security;

create policy "Users manage own top lists"
  on user_top_lists for all
  using (auth.uid() = user_id);

-- Favourites (heart button, unlimited)
create table user_favourites (
  id          uuid default gen_random_uuid() primary key,
  user_id     uuid references auth.users not null,
  tmdb_id     integer not null,
  media_type  text not null check (media_type in ('movie', 'tv')),
  title       text not null,
  poster_path text,
  created_at  timestamptz default now(),
  unique (user_id, tmdb_id)
);

alter table user_favourites enable row level security;

create policy "Users manage own favourites"
  on user_favourites for all
  using (auth.uid() = user_id);

-- Custom lists (user-created named lists)
create table user_custom_lists (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users not null,
  name       text not null,
  created_at timestamptz default now()
);

alter table user_custom_lists enable row level security;

create policy "Users manage own custom lists"
  on user_custom_lists for all
  using (auth.uid() = user_id);

-- Items in custom lists
create table user_custom_list_items (
  id          uuid default gen_random_uuid() primary key,
  list_id     uuid references user_custom_lists on delete cascade not null,
  user_id     uuid references auth.users not null,
  tmdb_id     integer not null,
  media_type  text not null check (media_type in ('movie', 'tv')),
  title       text not null,
  poster_path text,
  added_at    timestamptz default now(),
  unique (list_id, tmdb_id)
);

alter table user_custom_list_items enable row level security;

create policy "Users manage own custom list items"
  on user_custom_list_items for all
  using (auth.uid() = user_id);
