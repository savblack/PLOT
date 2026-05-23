-- Expand provider check to include 'trakt'
alter table media_integrations
  drop constraint if exists media_integrations_provider_check;
alter table media_integrations
  add constraint media_integrations_provider_check
  check (provider in ('plex', 'companion', 'trakt'));

-- Trakt OAuth token columns (encrypted, same pattern as Plex)
alter table media_integrations
  add column if not exists trakt_token_ciphertext    text,
  add column if not exists trakt_token_iv            text,
  add column if not exists trakt_refresh_ciphertext  text,
  add column if not exists trakt_refresh_iv          text,
  add column if not exists trakt_token_expires_at    timestamptz,
  add column if not exists trakt_redirect_uri        text;

-- Expand outbox action check to include Trakt actions
alter table integration_outbox
  drop constraint if exists integration_outbox_action_check;
alter table integration_outbox
  add constraint integration_outbox_action_check
  check (action in (
    'plex_watchlist_add',
    'trakt_watchlist_add',
    'trakt_watchlist_remove'
  ));

-- Index for efficient per-integration outbox queries
create index if not exists integration_outbox_integration_status_idx
  on integration_outbox (integration_id, status, created_at)
  where status = 'pending';
