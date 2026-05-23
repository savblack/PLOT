alter table media_integrations
  alter column device_token_hash drop not null;

alter table media_integrations
  add column if not exists plex_token_ciphertext text,
  add column if not exists plex_token_iv text,
  add column if not exists plex_account jsonb not null default '{}'::jsonb,
  add column if not exists plex_servers jsonb not null default '[]'::jsonb,
  add column if not exists selected_server jsonb,
  add column if not exists auth_pin_id text,
  add column if not exists auth_pin_code text,
  add column if not exists auth_expires_at timestamptz;
