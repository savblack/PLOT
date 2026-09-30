-- Saved annotations are private provenance, not evidence that a title was watched.
create table public.imported_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (length(source) between 1 and 64),
  source_key text not null check (length(source_key) between 1 and 2048),
  tmdb_id integer not null check (tmdb_id > 0),
  media_type text not null check (media_type in ('movie','tv')),
  annotation_scope text not null check (annotation_scope in ('movie','show','season','episode')),
  season_number integer,
  episode_number integer,
  annotation jsonb not null check (jsonb_typeof(annotation) = 'object' and coalesce(annotation->>'kind','') in ('rating','review')),
  external_ids jsonb not null default '{}'::jsonb check (jsonb_typeof(external_ids) = 'object'),
  imported_at timestamptz not null default now(),
  unique(user_id,source_key),
  check (
    (annotation_scope='movie' and media_type='movie' and season_number is null and episode_number is null) or
    (annotation_scope='show' and media_type='tv' and season_number is null and episode_number is null) or
    (annotation_scope='season' and media_type='tv' and season_number is not null and season_number>=0 and episode_number is null) or
    (annotation_scope='episode' and media_type='tv' and season_number is not null and season_number>=0 and episode_number is not null and episode_number>=1)
  )
);
alter table public.imported_annotations enable row level security;
create policy "Read own imported annotations" on public.imported_annotations for select to authenticated using(user_id=auth.uid());
revoke all on public.imported_annotations from anon, authenticated;
grant select on public.imported_annotations to authenticated;
grant all on public.imported_annotations to service_role;

create function public.import_saved_annotations(p_records jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare owner uuid:=auth.uid(); item jsonb; detail jsonb; added integer:=0; saved uuid; value numeric;
begin
  if owner is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>50 then raise exception 'Invalid annotation batch'; end if;
  for item in select jsonb_array_elements(p_records) loop
    detail:=item->'annotation';
    if jsonb_typeof(detail) is distinct from 'object' or coalesce(detail->>'kind','') not in ('rating','review') then raise exception 'Invalid annotation'; end if;
    if detail->>'kind'='rating' then
      if jsonb_typeof(detail->'rating') is distinct from 'number' then raise exception 'Invalid rating'; end if;
      value:=(detail->>'rating')::numeric;
      if value<1 or value>10 or value<>trunc(value) then raise exception 'Invalid rating'; end if;
      -- Validate timestamp syntax without deriving watched dates or inventing dates.
      perform (detail->>'ratedAt')::timestamptz;
    else
      if jsonb_typeof(detail->'text') is distinct from 'string' or coalesce(length(trim(detail->>'text')),0)=0 or length(detail->>'text')>200000 or
        jsonb_typeof(detail->'spoiler') is distinct from 'boolean' or jsonb_typeof(detail->'isReview') is distinct from 'boolean' then raise exception 'Invalid review'; end if;
      perform (detail->>'createdAt')::timestamptz;
      perform (detail->>'updatedAt')::timestamptz;
    end if;
    saved:=null;
    insert into public.imported_annotations(user_id,source,source_key,tmdb_id,media_type,annotation_scope,season_number,episode_number,annotation,external_ids)
      values(owner,item->>'source',item->>'source_key',(item->>'tmdb_id')::integer,item->>'media_type',item->>'annotation_scope',
        (item->>'season_number')::integer,(item->>'episode_number')::integer,detail,coalesce(item->'external_ids','{}'::jsonb))
      on conflict(user_id,source_key) do nothing returning id into saved;
    if saved is not null then added:=added+1; end if;
  end loop;
  return jsonb_build_object('inserted',added,'duplicates',jsonb_array_length(p_records)-added);
end $$;
revoke all on function public.import_saved_annotations(jsonb) from public, anon;
grant execute on function public.import_saved_annotations(jsonb) to authenticated;
