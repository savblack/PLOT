create extension if not exists pgcrypto;

delete from list_items a
using list_items b
where a.ctid < b.ctid
  and a.list_id = b.list_id
  and a.tmdb_id = b.tmdb_id;

create unique index if not exists list_items_list_id_tmdb_id_key
  on list_items(list_id, tmdb_id);

create table if not exists media_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('plex', 'companion')),
  display_name text not null default 'Local companion',
  device_token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled', 'error')),
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists media_integrations_device_token_hash_key
  on media_integrations(device_token_hash);

create index if not exists media_integrations_user_id_idx
  on media_integrations(user_id);

create table if not exists integration_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid references media_integrations(id) on delete cascade,
  source text not null,
  external_id text not null,
  external_guid text,
  tmdb_id integer,
  media_type text check (media_type in ('movie', 'tv')),
  title text,
  poster_path text,
  release_date date,
  match_state text not null default 'unmatched' check (match_state in ('matched', 'unmatched', 'needs_review')),
  sync_state text not null default 'active' check (sync_state in ('active', 'stale', 'ignored', 'pending', 'error')),
  availability jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  watched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, source, external_id)
);

create index if not exists integration_items_user_tmdb_idx
  on integration_items(user_id, tmdb_id)
  where tmdb_id is not null;

create index if not exists integration_items_integration_source_idx
  on integration_items(integration_id, source);

create table if not exists integration_outbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid references media_integrations(id) on delete set null,
  action text not null check (action in ('plex_watchlist_add')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'error', 'ignored')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists integration_outbox_user_status_idx
  on integration_outbox(user_id, status, created_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists media_integrations_set_updated_at on media_integrations;
create trigger media_integrations_set_updated_at
before update on media_integrations
for each row execute function set_updated_at();

drop trigger if exists integration_items_set_updated_at on integration_items;
create trigger integration_items_set_updated_at
before update on integration_items
for each row execute function set_updated_at();

drop trigger if exists integration_outbox_set_updated_at on integration_outbox;
create trigger integration_outbox_set_updated_at
before update on integration_outbox
for each row execute function set_updated_at();

alter table media_integrations enable row level security;
alter table integration_items enable row level security;
alter table integration_outbox enable row level security;

drop policy if exists "Users can read own media integrations" on media_integrations;
create policy "Users can read own media integrations"
on media_integrations for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own media integrations" on media_integrations;
create policy "Users can create own media integrations"
on media_integrations for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own media integrations" on media_integrations;
create policy "Users can update own media integrations"
on media_integrations for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own integration items" on integration_items;
create policy "Users can read own integration items"
on integration_items for select
using (auth.uid() = user_id);

drop policy if exists "Users can update own integration items" on integration_items;
create policy "Users can update own integration items"
on integration_items for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own integration outbox" on integration_outbox;
create policy "Users can read own integration outbox"
on integration_outbox for select
using (auth.uid() = user_id);

drop policy if exists "Users can create own integration outbox" on integration_outbox;
create policy "Users can create own integration outbox"
on integration_outbox for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own integration outbox" on integration_outbox;
create policy "Users can update own integration outbox"
on integration_outbox for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
