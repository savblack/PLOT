alter table public.media_integrations
  drop constraint if exists media_integrations_provider_check;

alter table public.media_integrations
  add constraint media_integrations_provider_check
  check (provider in ('plex', 'companion', 'trakt', 'simkl'));

alter table public.media_integrations
  add column if not exists simkl_token_ciphertext text,
  add column if not exists simkl_token_iv text,
  add column if not exists simkl_refresh_token_ciphertext text,
  add column if not exists simkl_refresh_token_iv text,
  add column if not exists simkl_pkce_ciphertext text,
  add column if not exists simkl_pkce_iv text,
  add column if not exists simkl_token_expires_at timestamptz,
  add column if not exists simkl_redirect_uri text,
  add column if not exists simkl_last_activity timestamptz;
