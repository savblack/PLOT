-- Remediate the validated database-bound findings from the 2026-09-18 deep
-- security scan. Application-side fixes live in the same branch.

-- ── 1. Custom-list children must belong to their parent owner ───────────────

-- Remove only impossible ownership pairs. Legitimate items already match the
-- list owner; mismatches are the unauthorized rows this invariant closes.
delete from public.user_custom_list_items i
where not exists (
  select 1
  from public.user_custom_lists l
  where l.id = i.list_id and l.user_id = i.user_id
);

alter table public.user_custom_lists
  add constraint user_custom_lists_id_user_id_key unique (id, user_id);

alter table public.user_custom_list_items
  add constraint user_custom_list_items_parent_owner_fkey
  foreign key (list_id, user_id)
  references public.user_custom_lists (id, user_id)
  on delete cascade;

drop policy if exists "Users manage own custom list items" on public.user_custom_list_items;
create policy "Users manage own custom list items"
  on public.user_custom_list_items for all to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_custom_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_custom_lists l
      where l.id = list_id and l.user_id = auth.uid()
    )
  );

-- ── 2. Privileged maintenance RPCs are service-only ─────────────────────────

revoke all on function public.auth_note_fail(text, text, bigint) from public, anon, authenticated;
grant execute on function public.auth_note_fail(text, text, bigint) to service_role;

-- redefines: auth_note_fail (reject nonsensical or attacker-amplified windows)
create or replace function public.auth_note_fail(p_scope text, p_ip text, p_window_ms bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_scope is null or char_length(p_scope) not between 1 and 64
     or p_ip is null or char_length(p_ip) not between 1 and 128
     or p_window_ms not between 1000 and 86400000 then
    raise exception 'Invalid auth throttle parameters' using errcode = '22023';
  end if;

  insert into public.auth_fail_attempts (scope, ip, fail_count, window_start)
  values (p_scope, p_ip, 1, now())
  on conflict (scope, ip) do update
    set fail_count = case
          when now() - auth_fail_attempts.window_start > (p_window_ms::text || ' milliseconds')::interval
            then 1
          else auth_fail_attempts.fail_count + 1
        end,
        window_start = case
          when now() - auth_fail_attempts.window_start > (p_window_ms::text || ' milliseconds')::interval
            then now()
          else auth_fail_attempts.window_start
        end
  returning fail_count into v_count;
  return v_count;
end;
$$;

revoke all on function public.run_marketing_linear_mirror() from public, anon, authenticated;
grant execute on function public.run_marketing_linear_mirror() to service_role;

-- ── 3. Follow approvals may change status only ──────────────────────────────

create or replace function public.enforce_follow_update_transition()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.follower_id is distinct from old.follower_id
     or new.following_id is distinct from old.following_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only follow status may be updated' using errcode = '42501';
  end if;
  if old.status is distinct from 'pending' or new.status is distinct from 'accepted' then
    raise exception 'Only pending follow requests may be accepted' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_follow_update_transition on public.follows;
create trigger trg_enforce_follow_update_transition
  before update on public.follows
  for each row execute function public.enforce_follow_update_transition();

drop policy if exists "following can update requests" on public.follows;
create policy "following can update requests" on public.follows
  for update to authenticated
  using (auth.uid() = following_id and status = 'pending')
  with check (auth.uid() = following_id and status = 'accepted');

-- ── 4. Distributed admission control before OMDb quota spend ────────────────

create table public.critic_score_request_quota (
  bucket text primary key check (char_length(bucket) between 1 and 128),
  request_count integer not null default 0 check (request_count >= 0),
  window_start timestamptz not null default now()
);

alter table public.critic_score_request_quota enable row level security;

create or replace function public.admit_critic_score_request(p_caller_bucket text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_global_count integer;
  v_global_start timestamptz;
  v_caller_count integer;
begin
  if p_caller_bucket is null
     or p_caller_bucket = 'global'
     or char_length(p_caller_bucket) not between 1 and 128 then
    raise exception 'Invalid critic-score caller bucket' using errcode = '22023';
  end if;

  insert into public.critic_score_request_quota (bucket, request_count, window_start)
  values ('global', 0, now())
  on conflict (bucket) do nothing;

  select request_count, window_start
    into v_global_count, v_global_start
  from public.critic_score_request_quota
  where bucket = 'global'
  for update;

  if now() - v_global_start >= interval '1 day' then
    v_global_count := 0;
    v_global_start := now();
    update public.critic_score_request_quota
      set request_count = 0, window_start = v_global_start
      where bucket = 'global';
  end if;

  -- Do not create caller rows once the shared upstream budget is exhausted.
  if v_global_count >= 900 then
    return false;
  end if;

  insert into public.critic_score_request_quota (bucket, request_count, window_start)
  values (p_caller_bucket, 1, now())
  on conflict (bucket) do update
    set request_count = case
          when now() - critic_score_request_quota.window_start
                 >= interval '1 hour'
            then 1
          else least(critic_score_request_quota.request_count + 1, 31)
        end,
        window_start = case
          when now() - critic_score_request_quota.window_start
                 >= interval '1 hour'
            then now()
          else critic_score_request_quota.window_start
        end
  returning request_count into v_caller_count;

  if v_caller_count > 30 then
    return false;
  end if;

  update public.critic_score_request_quota
    set request_count = v_global_count + 1
    where bucket = 'global';

  -- At most the admitted daily budget can create rows, and stale caller rows
  -- are removed continuously so rotating addresses cannot grow this table.
  delete from public.critic_score_request_quota
    where bucket <> 'global' and window_start < now() - interval '2 days';

  return true;
end;
$$;

revoke all on function public.admit_critic_score_request(text)
  from public, anon, authenticated;
grant execute on function public.admit_critic_score_request(text)
  to service_role;

-- ── 4b. Only one Linear reconciliation sweep may mutate at a time ──────────

create table public.marketing_linear_mirror_lease (
  singleton boolean primary key default true check (singleton),
  owner uuid not null,
  lease_until timestamptz not null
);

alter table public.marketing_linear_mirror_lease enable row level security;

create or replace function public.claim_marketing_linear_mirror(p_owner uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  if p_owner is null then
    raise exception 'Mirror lease owner is required' using errcode = '22023';
  end if;
  insert into public.marketing_linear_mirror_lease (singleton, owner, lease_until)
  values (true, p_owner, now() + interval '10 minutes')
  on conflict (singleton) do update
    set owner = excluded.owner, lease_until = excluded.lease_until
    where marketing_linear_mirror_lease.lease_until < now()
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.release_marketing_linear_mirror(p_owner uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.marketing_linear_mirror_lease where owner = p_owner
$$;

revoke all on function public.claim_marketing_linear_mirror(uuid) from public, anon, authenticated;
revoke all on function public.release_marketing_linear_mirror(uuid) from public, anon, authenticated;
grant execute on function public.claim_marketing_linear_mirror(uuid) to service_role;
grant execute on function public.release_marketing_linear_mirror(uuid) to service_role;

-- Authenticated uploads record storage.objects.owner_id. Account deletion uses
-- the caller's JWT, so Storage itself independently proves every removed object
-- belongs to that account.
drop policy if exists "Owners can delete feedback attachments" on storage.objects;
create policy "Owners can delete feedback attachments"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'feedback-attachments'
    and owner_id = auth.uid()::text
  );

-- ── 5. Raw follow rows are visible only to their participants ───────────────

drop policy if exists "accepted follows are public" on public.follows;
drop policy if exists "accepted follows visible to participants" on public.follows;
create policy "accepted follows visible to participants" on public.follows
  for select to authenticated
  using (
    status = 'accepted'
    and auth.uid() in (follower_id, following_id)
    and public.not_blocked(follower_id)
    and public.not_blocked(following_id)
  );

create or replace function public.get_follow_counts(p_target uuid)
returns table (followers bigint, following bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.follows f
      where f.following_id = p_target and f.status = 'accepted') as followers,
    (select count(*) from public.follows f
      where f.follower_id = p_target and f.status = 'accepted') as following
  where public.not_blocked(p_target)
    and (
      auth.uid() = p_target
      or public.is_profile_public(p_target)
      or public.is_accepted_follower(p_target)
    )
$$;

grant execute on function public.get_follow_counts(uuid) to anon, authenticated;

-- ── 5b. Serialize Plex sync work per integration ────────────────────────────

alter table public.media_integrations
  add column sync_started_at timestamptz;

-- ── 6. Notifications can update read_at only ────────────────────────────────

revoke update on table public.notifications from public, anon, authenticated;
grant update (read_at) on table public.notifications to authenticated;

-- redefines: list_notifications (add referenced-post visibility checks)
create or replace function public.list_notifications()
returns table (id uuid, type text, actor_id uuid, actor_username text,
               actor_display_name text, actor_avatar_url text, post_id uuid,
               post_title text, post_poster_path text,
               created_at timestamptz, read_at timestamptz)
language sql stable security definer set search_path = public as $$
  select n.id, n.type, n.actor_id, p.username, p.display_name, p.avatar_url,
         n.post_id, fp.title, fp.poster_path, n.created_at, n.read_at
  from public.notifications n
  join public.profiles p on p.id = n.actor_id
  left join public.feed_posts fp
    on fp.id = n.post_id
   and public.not_blocked(fp.author_id)
   and (
     auth.uid() = fp.author_id
     or public.is_profile_public(fp.author_id)
     or public.is_accepted_follower(fp.author_id)
   )
  where n.user_id = auth.uid()
    and public.not_blocked(n.actor_id)
  order by n.created_at desc
  limit 50
$$;
