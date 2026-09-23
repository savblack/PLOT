-- Disabled until worker/provider pilots pass. No scheduler is activated here.
create table public.tracking_connections (
  integration_id uuid primary key references public.media_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  automatic_enabled boolean not null default false,
  outgoing_enabled boolean not null default false,
  cursor_at timestamptz,
  last_full_at timestamptz,
  next_sync_at timestamptz not null default now(),
  last_success_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.tracking_jobs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.media_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('trakt', 'plex')),
  mode text not null check (mode in ('import', 'sync')),
  status text not null default 'queued' check (status in ('queued','running','retry_wait','paused','succeeded','partial','failed','cancelled')),
  checkpoint jsonb not null default '{}' check (jsonb_typeof(checkpoint) = 'object'),
  imported integer not null default 0 check (imported >= 0),
  duplicates integer not null default 0 check (duplicates >= 0),
  skipped integer not null default 0 check (skipped >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);
create index tracking_connections_user on public.tracking_connections(user_id);
create index tracking_jobs_user_created on public.tracking_jobs(user_id,created_at desc);
create index tracking_jobs_worker_due on public.tracking_jobs(provider,status,available_at);
create unique index tracking_jobs_one_open on public.tracking_jobs(integration_id)
  where status in ('queued','running','retry_wait','paused');
create index tracking_jobs_due on public.tracking_jobs(status, available_at);
alter table public.tracking_connections enable row level security;
alter table public.tracking_jobs enable row level security;
create policy tracking_connections_owner_read on public.tracking_connections for select to authenticated using (user_id = auth.uid());
create policy tracking_jobs_owner_read on public.tracking_jobs for select to authenticated using (user_id = auth.uid());
revoke all on public.tracking_connections, public.tracking_jobs from public, anon, authenticated;
grant select on public.tracking_connections, public.tracking_jobs to authenticated;
grant all on public.tracking_connections, public.tracking_jobs to service_role;

-- Uncertain cross-source duplicates wait for an explicit user decision.
create table public.tracking_review_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid not null references public.media_integrations(id) on delete cascade,
  source_key text not null,
  payload jsonb not null,
  decision text not null default 'pending' check(decision in ('pending','keep','skip')),
  created_at timestamptz not null default now(),
  unique(user_id,source_key)
);
create index tracking_review_pending on public.tracking_review_items(user_id,decision,created_at);
alter table public.tracking_review_items enable row level security;
create policy tracking_review_owner_read on public.tracking_review_items for select to authenticated using(user_id = auth.uid());
revoke all on public.tracking_review_items from public, anon, authenticated;
grant select on public.tracking_review_items to authenticated;
grant all on public.tracking_review_items to service_role;
create function public.resolve_tracking_review(p_review uuid,p_keep boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare item public.tracking_review_items; result jsonb := '{}'::jsonb;
begin
  select * into item from public.tracking_review_items where id = p_review and user_id = auth.uid() for update;
  if not found then raise exception 'Review not found' using errcode = '42501'; end if;
  if item.decision <> 'pending' then return jsonb_build_object('already_reviewed',true); end if;
  if p_keep then result := public.import_watch_events(jsonb_build_array(item.payload)); end if;
  update public.tracking_review_items set decision = case when p_keep then 'keep' else 'skip' end where id = item.id;
  return result;
end $$;
revoke all on function public.resolve_tracking_review(uuid,boolean) from public, anon;
grant execute on function public.resolve_tracking_review(uuid,boolean) to authenticated;

-- Provenance for non-watch records. Retained after local watchlist removal, so
-- a repeated import cannot undo the user's edit or invent a watch event.
create table public.tracking_import_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  kind text not null check(kind = 'watchlist'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique(user_id,source_key)
);
alter table public.tracking_import_items enable row level security;
create policy "Read own imported memberships" on public.tracking_import_items for select to authenticated using(user_id=auth.uid());
revoke all on public.tracking_import_items from anon, authenticated;
grant select on public.tracking_import_items to authenticated;
grant all on public.tracking_import_items to service_role;

-- User controls are checked server-side. One-time Trakt imports remain free.
create function public.control_tracking(p_integration uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare connection public.media_integrations; job public.tracking_jobs; premium boolean;
begin
  select * into connection from public.media_integrations where id = p_integration and user_id = auth.uid() for update;
  if not found then raise exception 'Connection not found' using errcode = '42501'; end if;
  if connection.provider not in ('trakt','plex') then raise exception 'Unsupported provider'; end if;
  premium := public.is_premium(connection.user_id);
  if connection.provider = 'plex' and p_action in ('enable_automatic','sync','resume') and
    (connection.selected_server->>'clientIdentifier' is null or connection.selected_server->>'accountID' is null) then raise exception 'Select a Plex server and profile first'; end if;
  if p_action in ('enable_automatic','enable_outgoing','sync') and not premium then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  insert into public.tracking_connections(integration_id,user_id) values(connection.id,connection.user_id) on conflict do nothing;
  if p_action in ('enable_automatic','disable_automatic') then
    if p_action = 'enable_automatic' and connection.status <> 'active' then raise exception 'Reconnect first'; end if;
    update public.tracking_connections set automatic_enabled = p_action = 'enable_automatic' where integration_id = connection.id;
    if p_action = 'enable_automatic' then
      update public.tracking_jobs set status = 'queued', available_at = now(), attempts = 0, last_error = null, updated_at = now()
        where integration_id = connection.id and mode = 'sync' and status = 'paused';
    end if;
    if p_action = 'disable_automatic' then
      update public.tracking_jobs set status = 'paused', lease_token = null, lease_until = null, updated_at = now()
      where integration_id = connection.id and mode = 'sync' and status in ('queued','running','retry_wait');
    end if;
  elsif p_action in ('enable_outgoing','disable_outgoing') then
    if p_action = 'enable_outgoing' and connection.status <> 'active' then raise exception 'Reconnect first'; end if;
    -- Consent starts with future actions, never a backlog queued before opt-in.
    update public.integration_outbox set status = 'ignored' where integration_id = connection.id and status = 'pending';
    update public.tracking_connections set outgoing_enabled = p_action = 'enable_outgoing' where integration_id = connection.id;
  elsif p_action = 'cancel' then
    update public.tracking_jobs set status = 'cancelled', lease_token = null, lease_until = null, finished_at = now(), updated_at = now()
    where integration_id = connection.id and status in ('queued','running','retry_wait','paused');
  elsif p_action = 'resume' then
    if exists (select 1 from public.tracking_jobs where integration_id = connection.id and mode = 'sync' and status in ('paused','failed')) and not premium then raise exception 'premium_required' using errcode = '42501'; end if;
    if connection.status <> 'active' then raise exception 'Reconnect first'; end if;
    update public.tracking_jobs set status = 'queued', attempts = 0, available_at = now(), last_error = null, updated_at = now()
    where id = (select id from public.tracking_jobs where integration_id = connection.id and status in ('paused','failed') order by created_at desc limit 1)
      and not exists(select 1 from public.tracking_jobs where integration_id = connection.id and status in ('queued','running','retry_wait'));
  elsif p_action in ('import','sync') then
    if connection.status <> 'active' then raise exception 'Reconnect first'; end if;
    if p_action = 'import' and connection.provider <> 'trakt' then raise exception 'Saved file imports are available without a connection'; end if;
    insert into public.tracking_jobs(integration_id,user_id,provider,mode)
      values(connection.id,connection.user_id,connection.provider,p_action)
      on conflict (integration_id) where status in ('queued','running','retry_wait','paused') do nothing;
  else raise exception 'Unknown tracking action';
  end if;
  select * into job from public.tracking_jobs where integration_id = connection.id order by created_at desc limit 1;
  return jsonb_build_object('job',to_jsonb(job));
end $$;
revoke all on function public.control_tracking(uuid,text) from public, anon;
grant execute on function public.control_tracking(uuid,text) to authenticated;

-- A caller must hold the service-role key. Claims use account-scoped advisory
-- locks plus fenced leases; a timed-out worker cannot commit after a new claim.
create function public.claim_tracking_job(p_provider text, p_users uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.tracking_jobs;
begin
  update public.tracking_jobs j set status = 'paused', lease_token = null, lease_until = null,
    last_error = 'Premium expired. Automatic updates are paused.', updated_at = now()
  where (p_users is null or j.user_id = any(p_users)) and j.mode = 'sync' and j.status in ('queued','running','retry_wait') and not public.is_premium(j.user_id);
  for job in select j.* from public.tracking_jobs j join public.media_integrations i on i.id = j.integration_id
    where j.provider = p_provider and (p_users is null or j.user_id = any(p_users)) and i.status = 'active'
    and ((j.status in ('queued','retry_wait') and j.available_at <= now()) or (j.status = 'running' and j.lease_until < now()))
    order by j.available_at, j.created_at for update of j skip locked
  loop
    if not pg_try_advisory_xact_lock(hashtextextended(job.user_id::text, 17)) then continue; end if;
    if exists (select 1 from public.tracking_jobs where user_id = job.user_id and id <> job.id and status = 'running' and lease_until > now()) then continue; end if;
    update public.tracking_jobs set status = 'running', lease_token = gen_random_uuid(), lease_until = now() + interval '2 minutes',
      updated_at = now() where id = job.id returning * into job;
    return to_jsonb(job);
  end loop;
  return null;
end $$;
revoke all on function public.claim_tracking_job(text,uuid[]) from public, anon, authenticated;
grant execute on function public.claim_tracking_job(text,uuid[]) to service_role;

create function public.finish_tracking_page(p_job uuid, p_lease uuid, p_records jsonb, p_checkpoint jsonb, p_done boolean, p_skipped integer default 0)
returns jsonb language plpgsql security definer set search_path = public as $$
declare job public.tracking_jobs; connection public.media_integrations; item jsonb; event jsonb; summary jsonb;
  inserted_id uuid; destination uuid; added integer := 0; duplicate_count integer := 0; review_total integer := 0; ignored integer := 0;
begin
  -- Always lock the connection before its job, matching control/disconnect.
  select i.* into connection from public.media_integrations i join public.tracking_jobs j on j.integration_id = i.id where j.id = p_job for update of i;
  select * into job from public.tracking_jobs where id = p_job for update;
  if job.id is null or job.status <> 'running' or job.lease_token is distinct from p_lease or job.lease_until <= now() then raise exception 'Stale job lease'; end if;
  if connection.status <> 'active' then raise exception 'Connection is not active'; end if;
  if job.mode = 'sync' and not public.is_premium(job.user_id) then
    update public.tracking_jobs set status = 'paused', lease_token = null, lease_until = null, last_error = 'Premium expired. Automatic updates are paused.' where id = job.id;
    return jsonb_build_object('paused',true);
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 100 or
    p_checkpoint is null or jsonb_typeof(p_checkpoint) <> 'object' or p_skipped < 0 then raise exception 'Invalid page'; end if;
  for item in select value from jsonb_array_elements(p_records) loop
    if item->>'kind' = 'watchlist' then
      summary := item->'summary';
      if item->>'source' is distinct from job.provider or coalesce(item->>'source_key','') = '' or
        coalesce(summary->>'media_type','') not in ('movie','tv') or coalesce((summary->>'tmdb_id')::integer,0) <= 0 or
        coalesce(summary->>'title','') = '' then raise exception 'Invalid watchlist provenance'; end if;
      inserted_id := null;
      insert into public.tracking_import_items(user_id,source_key,kind,payload)
        values(job.user_id,item->>'source_key','watchlist',item)
        on conflict(user_id,source_key) do nothing returning id into inserted_id;
      if inserted_id is null then duplicate_count := duplicate_count + 1; continue; end if;
      insert into public.lists(user_id,name) values(job.user_id,'__watchlist__') on conflict(user_id,name) do nothing;
      select id into destination from public.lists where user_id=job.user_id and name='__watchlist__';
      inserted_id := null;
      insert into public.list_items(list_id,user_id,tmdb_id,media_type,title,poster_path)
        values(destination,job.user_id,(summary->>'tmdb_id')::integer,summary->>'media_type',summary->>'title',summary->>'poster_path')
        on conflict(list_id,tmdb_id) do nothing returning id into inserted_id;
      if inserted_id is null then duplicate_count := duplicate_count + 1; else added := added + 1; end if;
      continue;
    end if;
    event := item->'event'; summary := item->'summary';
    if event->>'source' is distinct from job.provider or
       event->>'tmdb_id' is distinct from summary->>'tmdb_id' or event->>'media_type' is distinct from summary->>'media_type' then
      raise exception 'Invalid event provenance';
    end if;
    if exists(select 1 from public.watch_events where user_id = job.user_id and source_key = event->>'source_key') then
      duplicate_count := duplicate_count + 1; continue;
    end if;
    if exists(select 1 from public.tracking_review_items where user_id = job.user_id and source_key = event->>'source_key' and decision = 'skip') then
      ignored := ignored + 1; continue;
    end if;
    if exists(select 1 from public.watch_events w where w.user_id = job.user_id
      and w.tmdb_id = (event->>'tmdb_id')::integer and w.media_type = event->>'media_type'
      and w.season_number is not distinct from (event->>'season_number')::integer
      and w.episode_number is not distinct from (event->>'episode_number')::integer
      and (w.source <> event->>'source' or w.source_account <> event->>'source_account')
      and (w.watched_on is null or event->>'watched_on' is null or w.watched_on = (event->>'watched_on')::date)) then
      insert into public.tracking_review_items(user_id,integration_id,source_key,payload)
        values(job.user_id,job.integration_id,event->>'source_key',item) on conflict(user_id,source_key) do nothing;
      review_total := review_total + 1; continue;
    end if;
    inserted_id := null;
    insert into public.watch_events(user_id,source,source_account,source_key,tmdb_id,media_type,season_number,episode_number,
      watched_on,watched_at,date_precision,external_ids,source_rating,source_review)
    values(job.user_id,event->>'source',event->>'source_account',event->>'source_key',(event->>'tmdb_id')::integer,event->>'media_type',
      (event->>'season_number')::integer,(event->>'episode_number')::integer,(event->>'watched_on')::date,(event->>'watched_at')::timestamptz,
      event->>'date_precision',coalesce(event->'external_ids','{}'::jsonb),(event->>'source_rating')::numeric,event->>'source_review')
    on conflict(user_id,source_key) do nothing returning id into inserted_id;
    if inserted_id is null then duplicate_count := duplicate_count + 1; continue; end if;
    if event->>'episode_number' is null then
      insert into public.history(user_id,tmdb_id,media_type,title,poster_path,watched_at,rating,note,genre_ids)
      values(job.user_id,(summary->>'tmdb_id')::integer,summary->>'media_type',summary->>'title',summary->>'poster_path',
        (summary->>'watched_at')::date,(summary->>'rating')::integer,summary->>'note',
        array(select jsonb_array_elements_text(coalesce(nullif(summary->'genre_ids','null'::jsonb),'[]'::jsonb))::integer))
      on conflict(user_id,tmdb_id,media_type) do nothing;
    end if;
    added := added + 1;
  end loop;
  update public.tracking_jobs set checkpoint = p_checkpoint, imported = imported + added, duplicates = duplicates + duplicate_count,
    skipped = skipped + p_skipped + ignored, review_count = review_count + review_total, attempts = 0, status = case when not p_done then 'queued' when skipped + p_skipped + ignored + review_count + review_total > 0 then 'partial' else 'succeeded' end,
    lease_token = null, lease_until = null, available_at = now(), updated_at = now(),
    finished_at = case when p_done then now() else null end,
    last_error = case when p_done and skipped + p_skipped + ignored + review_count + review_total > 0 then 'Some records were skipped or need duplicate review. Review the counts before retrying.' else null end where id = job.id;
  if p_done then
    update public.tracking_connections set next_sync_at = now() + interval '6 hours' where integration_id = job.integration_id;
  end if;
  if p_done and job.skipped + p_skipped + ignored + job.review_count + review_total = 0 then
    update public.tracking_connections set last_success_at = now(), last_full_at = case when (p_checkpoint->>'full')::boolean then now() else last_full_at end, cursor_at = (p_checkpoint->>'until')::timestamptz,
      next_sync_at = now() + interval '6 hours' where integration_id = job.integration_id;
    update public.media_integrations set last_sync_at = now(), last_error = null where id = job.integration_id;
  end if;
  return jsonb_build_object('inserted',added,'duplicates',duplicate_count);
end $$;
revoke all on function public.finish_tracking_page(uuid,uuid,jsonb,jsonb,boolean,integer) from public, anon, authenticated;
grant execute on function public.finish_tracking_page(uuid,uuid,jsonb,jsonb,boolean,integer) to service_role;

create function public.fail_tracking_job(p_job uuid, p_lease uuid, p_error text, p_retry_seconds integer default 60, p_terminal boolean default false)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.tracking_jobs set attempts = attempts + 1,
    status = case when p_terminal or attempts >= 7 then 'failed' else 'retry_wait' end,
    available_at = now() + make_interval(secs => greatest(1,least(86400,p_retry_seconds))),
    lease_token = null, lease_until = null, last_error = left(p_error,500), updated_at = now()
  where id = p_job and status = 'running' and lease_token = p_lease and lease_until > now();
  return found;
end $$;
revoke all on function public.fail_tracking_job(uuid,uuid,text,integer,boolean) from public, anon, authenticated;
grant execute on function public.fail_tracking_job(uuid,uuid,text,integer,boolean) to service_role;

create function public.enqueue_due_tracking_jobs(p_provider text, p_users uuid[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare total integer;
begin
  insert into public.tracking_jobs(integration_id,user_id,provider,mode)
    select c.integration_id,c.user_id,i.provider,'sync' from public.tracking_connections c
    join public.media_integrations i on i.id = c.integration_id
    where (p_users is null or c.user_id = any(p_users)) and c.automatic_enabled and c.next_sync_at <= now() and i.status = 'active'
      and i.provider = p_provider and public.is_premium(c.user_id)
      and not exists(select 1 from public.tracking_jobs j where j.integration_id = c.integration_id and j.status = 'failed'
        and not exists(select 1 from public.tracking_jobs newer where newer.integration_id = j.integration_id and newer.created_at > j.created_at))
    on conflict (integration_id) where status in ('queued','running','retry_wait','paused') do nothing;
  get diagnostics total = row_count;
  return total;
end $$;
revoke all on function public.enqueue_due_tracking_jobs(text,uuid[]) from public, anon, authenticated;
grant execute on function public.enqueue_due_tracking_jobs(text,uuid[]) to service_role;

create function public.stop_tracking_on_disconnect()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'active' then
    update public.tracking_connections set automatic_enabled = false, outgoing_enabled = false, cursor_at = null, last_full_at = null, last_success_at = null where integration_id = new.id;
    update public.tracking_jobs set status = 'cancelled', lease_token = null, lease_until = null, finished_at = now(), updated_at = now()
      where integration_id = new.id and status in ('queued','running','retry_wait','paused');
  end if;
  return new;
end $$;
revoke all on function public.stop_tracking_on_disconnect() from public, anon, authenticated;
create trigger stop_tracking_on_disconnect after update of status on public.media_integrations
for each row when (new.status <> 'active') execute function public.stop_tracking_on_disconnect();

create function public.save_tracking_tokens(p_job uuid,p_lease uuid,p_access text,p_access_iv text,p_refresh text,p_refresh_iv text,p_expires timestamptz)
returns boolean language plpgsql security definer set search_path = public as $$
declare job public.tracking_jobs; connection public.media_integrations;
begin
  select i.* into connection from public.media_integrations i join public.tracking_jobs j on j.integration_id=i.id where j.id=p_job for update of i;
  select * into job from public.tracking_jobs where id=p_job for update;
  if connection.status <> 'active' or job.status <> 'running' or job.lease_token is distinct from p_lease or job.lease_until <= now() then return false; end if;
  update public.media_integrations set trakt_token_ciphertext=p_access,trakt_token_iv=p_access_iv,
    trakt_refresh_ciphertext=p_refresh,trakt_refresh_iv=p_refresh_iv,trakt_token_expires_at=p_expires
  where id=connection.id;
  return found;
end $$;
revoke all on function public.save_tracking_tokens(uuid,uuid,text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.save_tracking_tokens(uuid,uuid,text,text,text,text,timestamptz) to service_role;

-- Server/profile values have been checked against fresh Plex resources by the
-- edge function. Selection and job cancellation share the connection row lock.
create function public.select_plex_tracking_source(p_integration uuid, p_selection jsonb, p_servers jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.media_integrations where id = p_integration and provider = 'plex' and status = 'active' for update;
  if not found then raise exception 'Reconnect Plex first'; end if;
  update public.tracking_jobs set status = 'cancelled', lease_token = null, lease_until = null, finished_at = now(), updated_at = now()
    where integration_id = p_integration and status in ('queued','running','retry_wait','paused');
  update public.tracking_connections set automatic_enabled = false, cursor_at = null, last_full_at = null, last_success_at = null, next_sync_at = now()
    where integration_id = p_integration;
  update public.media_integrations set selected_server = p_selection, plex_servers = p_servers where id = p_integration;
end $$;
revoke all on function public.select_plex_tracking_source(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.select_plex_tracking_source(uuid,jsonb,jsonb) to service_role;

-- Earlier Plex resource snapshots copied provider accessToken fields into JSON
-- exposed to clients. Retain only display identity, never server credentials or
-- URLs. Legacy automatic server picks have no explicit profile consent.
update public.media_integrations i set
  plex_servers = coalesce((select jsonb_agg(jsonb_build_object('clientIdentifier',r->>'clientIdentifier','name',r->>'name'))
    from jsonb_array_elements(case when jsonb_typeof(i.plex_servers)='array' then i.plex_servers else '[]'::jsonb end) r
    where r->>'clientIdentifier' is not null),'[]'::jsonb),
  selected_server = case when i.selected_server->>'clientIdentifier' is not null and i.selected_server->>'accountID' ~ '^[0-9]+$'
    then jsonb_build_object('clientIdentifier',i.selected_server->>'clientIdentifier','accountID',i.selected_server->>'accountID',
      'name',i.selected_server->>'name','profileName',i.selected_server->>'profileName') else null end
where i.provider='plex';
