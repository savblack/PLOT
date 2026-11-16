-- Background imports saved nothing once the event importer was switched on.
--
-- The import-worker edge function runs the same writers the apps run:
-- import_watch_events, import_saved_list and import_saved_annotations. All
-- three take the account from auth.uid() and raise 42501 when there is none,
-- which is right for a browser. The worker is the service role, so it has no
-- auth.uid(): every batch was refused, the job ended "partial" with
-- imported = 0, and no row was written. Found on 2026-11-16 by
-- running four sample files through production on the monitoring account.
--
-- Additive only. Nothing existing is redefined: each new function names the
-- account for the length of the call, runs the existing function unchanged,
-- then puts the request's own identity back. So the worker runs the same
-- statements a signed-in person does, including the free custom-list limit
-- and every trigger on history.
--
-- One difference: row-level security. import_watch_events is security
-- invoker, and called from here it runs as this function's owner, so the
-- insert policies on watch_events and history are skipped rather than
-- evaluated. That changes nothing today (both policies are
-- user_id = auth.uid(), and the function writes auth.uid() itself), but a
-- stricter insert policy added later will not apply to worker imports unless
-- it is also enforced inside import_watch_events.
--
-- The service role alone may call these. The worker passes job.user_id, which
-- enqueue_file_import_job set from auth.uid() when the person queued the job.

create function public.import_act_as_user(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prior jsonb := jsonb_build_object(
    'claims', current_setting('request.jwt.claims', true),
    'sub', current_setting('request.jwt.claim.sub', true),
    'role', current_setting('request.jwt.claim.role', true));
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'Unknown account' using errcode = '22023';
  end if;
  -- Transaction-local, like the values PostgREST sets for a request. auth.uid()
  -- reads request.jwt.claim.sub first and request.jwt.claims second, so set both.
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  return prior;
end;
$$;

create function public.import_act_as_restore(p_prior jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('request.jwt.claims', coalesce(p_prior->>'claims', ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(p_prior->>'sub', ''), true);
  perform set_config('request.jwt.claim.role', coalesce(p_prior->>'role', ''), true);
end;
$$;

create function public.import_watch_events_as(p_user uuid, p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare prior jsonb; result jsonb;
begin
  prior := public.import_act_as_user(p_user);
  result := public.import_watch_events(p_records);
  perform public.import_act_as_restore(prior);
  return result;
end;
$$;

create function public.import_saved_list_as(p_user uuid, p_list jsonb, p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare prior jsonb; result jsonb;
begin
  prior := public.import_act_as_user(p_user);
  result := public.import_saved_list(p_list, p_records);
  perform public.import_act_as_restore(prior);
  return result;
end;
$$;

create function public.import_saved_annotations_as(p_user uuid, p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare prior jsonb; result jsonb;
begin
  prior := public.import_act_as_user(p_user);
  result := public.import_saved_annotations(p_records);
  perform public.import_act_as_restore(prior);
  return result;
end;
$$;

-- An error inside any of them aborts the transaction, which discards the
-- transaction-local settings with it, so a failed call cannot leave the
-- account named.

-- service_role is named too: Supabase's default privileges grant it every new
-- function in public, and these two are not for calling on their own.
revoke all on function public.import_act_as_user(uuid) from public, anon, authenticated, service_role;
revoke all on function public.import_act_as_restore(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.import_watch_events_as(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.import_saved_list_as(uuid, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.import_saved_annotations_as(uuid, jsonb) from public, anon, authenticated;
-- The two helpers are called only from inside the three functions above
-- (which run as their owner), so nobody else needs them.
grant execute on function public.import_watch_events_as(uuid, jsonb) to service_role;
grant execute on function public.import_saved_list_as(uuid, jsonb, jsonb) to service_role;
grant execute on function public.import_saved_annotations_as(uuid, jsonb) to service_role;
