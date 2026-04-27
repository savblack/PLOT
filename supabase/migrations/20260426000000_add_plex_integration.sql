create table if not exists media_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null default 'plex',
  encrypted_token text,
  plex_pin_id text,
  plex_user_id text,
  plex_username text,
  plex_servers jsonb,
  selected_server_id text,
  sync_status text not null default 'disconnected',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

alter table media_integrations enable row level security;

create policy "Users can manage own integrations"
  on media_integrations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
