-- Staging only, transactional schema + fictional notes; no existing user data changes.
\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20260917010000_private_title_notes.sql
select id as owner from auth.users order by id limit 1 \gset
select id as other from auth.users where id <> :'owner' order by id limit 1 \gset
select set_config('request.jwt.claims', json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
set local role authenticated;
-- TMDB fixture verified in publicListSharing.test.js, not a guessed title ID.
select public.save_private_title_note(auth.uid(), 95396, 'tv', 'fictional private note', 0, 'Severance');
do $$ begin
  if (select note from public.private_title_notes where tmdb_id=95396 and media_type='tv') <> 'fictional private note' then raise exception 'owner read failed'; end if;
  perform public.save_private_title_note(auth.uid(), 95396, 'movie', 'different media type', 0, '');
  raise notice 'PASS owner can create/read and media types stay separate';
  begin
    perform public.save_private_title_note(auth.uid(), 95396, 'tv', 'stale overwrite', 0, '');
    raise exception 'stale write accepted';
  exception when serialization_failure then raise notice 'PASS stale write rejected'; end;
  perform public.save_private_title_note(auth.uid(), 95396, 'tv', '', 1, 'Severance');
  if (select note from public.private_title_notes where tmdb_id=95396 and media_type='tv') <> '' then raise exception 'delete failed'; end if;
  begin
    perform public.save_private_title_note(auth.uid(), 95396, 'tv', 'resurrection', 0, '');
    raise exception 'stale recreation accepted';
  exception when serialization_failure then raise notice 'PASS delete keeps revision protection'; end;
end $$;
reset role;
select set_config('plot.test_note_owner', :'owner', true);
select set_config('request.jwt.claims', json_build_object('sub', :'other', 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ declare affected integer; begin
  if exists(select 1 from public.private_title_notes) then raise exception 'cross-account read'; end if;
  update public.private_title_notes set note='other account overwrite';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-account write'; end if;
  delete from public.private_title_notes;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'cross-account delete'; end if;
  raise notice 'PASS another account cannot read/update/delete notes';
  begin
    insert into public.private_title_notes(user_id, tmdb_id, media_type, note)
      values(current_setting('plot.test_note_owner')::uuid, 95396, 'tv', 'forged owner');
    raise exception 'forged owner accepted';
  exception when insufficient_privilege then raise notice 'PASS forged owner insert denied'; end;
  begin
    perform public.save_private_title_note(current_setting('plot.test_note_owner')::uuid, 95396, 'tv', 'account switched', 2, '');
    raise exception 'account switch accepted';
  exception when insufficient_privilege then raise notice 'PASS changed account rejected'; end;
  begin
    perform public.save_private_title_note(auth.uid(), 95396, 'tv', repeat('x', 1001), 0, '');
    raise exception 'oversized note accepted';
  exception when check_violation then raise notice 'PASS note length enforced server-side'; end;
end $$;
reset role;
set local request.jwt.claims = '{"role":"anon"}';
set local role anon;
do $$ begin
  begin
    perform * from public.private_title_notes;
    raise exception 'anonymous read accepted';
  exception when insufficient_privilege then raise notice 'PASS anonymous read denied'; end;
  begin
    perform public.save_private_title_note(auth.uid(), 95396, 'tv', 'anonymous', 0, '');
    raise exception 'anonymous RPC accepted';
  exception when insufficient_privilege then raise notice 'PASS anonymous RPC denied'; end;
end $$;
reset role;
rollback;
