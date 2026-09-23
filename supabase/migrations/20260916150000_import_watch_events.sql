-- Authenticated, atomic, additive import. Both writes use caller RLS.
create function public.import_watch_events(p_records jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  event jsonb;
  summary jsonb;
  inserted_id uuid;
  imported integer := 0;
  duplicates integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 50 then
    raise exception 'Expected at most 50 records';
  end if;
  for item in select value from jsonb_array_elements(p_records) loop
    event := item->'event';
    summary := item->'summary';
    if (event->>'tmdb_id') is distinct from (summary->>'tmdb_id') or
       (event->>'media_type') is distinct from (summary->>'media_type') then
      raise exception 'Event and summary must describe the same title';
    end if;
    inserted_id := null;
    insert into public.watch_events(user_id, source, source_account, source_key,
      tmdb_id, media_type, season_number, episode_number, watched_on, watched_at,
      date_precision, external_ids, source_rating, source_review)
    values (auth.uid(), event->>'source', event->>'source_account', event->>'source_key',
      (event->>'tmdb_id')::integer, event->>'media_type',
      (event->>'season_number')::integer, (event->>'episode_number')::integer,
      (event->>'watched_on')::date, (event->>'watched_at')::timestamptz,
      event->>'date_precision', coalesce(event->'external_ids', '{}'::jsonb),
      (event->>'source_rating')::numeric, event->>'source_review')
    on conflict (user_id, source_key) do nothing returning id into inserted_id;
    if inserted_id is null then
      duplicates := duplicates + 1;
      continue;
    end if;
    -- An episode watch is not evidence that the whole series was completed.
    -- Keep it in the additive ledger without moving the continuous pointer.
    if event->>'episode_number' is null then
      insert into public.history(user_id, tmdb_id, media_type, title, poster_path,
        watched_at, rating, note, genre_ids)
      values (auth.uid(), (summary->>'tmdb_id')::integer, summary->>'media_type',
        summary->>'title', summary->>'poster_path', (summary->>'watched_at')::date,
        (summary->>'rating')::integer, summary->>'note',
        array(select jsonb_array_elements_text(coalesce(nullif(summary->'genre_ids', 'null'::jsonb), '[]'::jsonb))::integer))
      on conflict (user_id, tmdb_id, media_type) do nothing;
    end if;
    imported := imported + 1;
  end loop;
  return jsonb_build_object('inserted', imported, 'duplicates', duplicates);
end;
$$;
revoke all on function public.import_watch_events(jsonb) from public, anon;
grant execute on function public.import_watch_events(jsonb) to authenticated;
