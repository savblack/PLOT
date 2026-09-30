\set ON_ERROR_STOP on
begin;
\i supabase/migrations/20260917130000_imported_annotations.sql
create temporary table annotation_fixture as select h.* from public.history h limit 1;
do $$ begin if not exists(select 1 from annotation_fixture) then raise exception 'An existing staging title is required'; end if; end $$;
grant select on annotation_fixture to authenticated;
select set_config('request.jwt.claims',json_build_object('sub',user_id,'role','authenticated')::text,true) from annotation_fixture \gset
set local role authenticated;
do $$ declare payload jsonb; result jsonb; before_history jsonb; begin
  select jsonb_build_object('source','trakt','source_key','annotation-proof','user_id',gen_random_uuid(),'tmdb_id',tmdb_id,'media_type',media_type,
    'annotation_scope',case when media_type='movie' then 'movie' else 'show' end,'annotation',jsonb_build_object('kind','rating','rating',8,'ratedAt',null)) into payload from annotation_fixture;
  select jsonb_agg(to_jsonb(h) order by id) into before_history from public.history h;
  result:=public.import_saved_annotations(jsonb_build_array(payload));
  if result->>'inserted'<>'1' or not exists(select 1 from public.imported_annotations where user_id=auth.uid() and source_key='annotation-proof') then raise exception 'Owner assignment failed'; end if;
  result:=public.import_saved_annotations(jsonb_build_array(jsonb_set(payload,'{annotation,rating}','2')));
  if result->>'duplicates'<>'1' or (select annotation->>'rating' from public.imported_annotations where source_key='annotation-proof')<>'8' then raise exception 'Reimport changed annotation'; end if;
  if (select jsonb_agg(to_jsonb(h) order by id) from public.history h) is distinct from before_history then raise exception 'Annotation changed history'; end if;
  raise notice 'PASS annotations retain source data, assign authenticated ownership and preserve history on reimport';
  begin
    perform public.import_saved_annotations(jsonb_build_array(jsonb_set(payload,'{source_key}','"atomic-proof"'),jsonb_set(payload,'{annotation,rating}','100')));
    raise exception 'Invalid rating accepted';
  exception when raise_exception then
    if sqlerrm='Invalid rating accepted' then raise; end if;
  end;
  if exists(select 1 from public.imported_annotations where source_key='atomic-proof') then raise exception 'Invalid batch left partial rows'; end if;
  raise notice 'PASS invalid annotation batch rolls back its earlier records';
  begin
    insert into public.imported_annotations default values;
    raise exception 'Direct write allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS direct client annotation writes are denied';
end $$;
reset role;
select set_config('request.jwt.claims',json_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true) \gset
set local role authenticated;
do $$ begin
  if exists(select 1 from public.imported_annotations) then raise exception 'Cross-account annotations leaked'; end if;
  raise notice 'PASS annotations are invisible to another account';
end $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.imported_annotations;
    raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform public.import_saved_annotations('[]');
    raise exception 'Anonymous RPC allowed';
  exception when insufficient_privilege then null; end;
  raise notice 'PASS anonymous annotation reads and writes denied';
end $$;
reset role;
rollback;
