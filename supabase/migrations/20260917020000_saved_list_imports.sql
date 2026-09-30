-- Private provenance retains source notes and protects local edits on reimport.
create table public.imported_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  list_id uuid references public.user_custom_lists(id) on delete set null,
  metadata jsonb not null,
  unique(user_id,source_key)
);
create table public.imported_list_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null,
  payload jsonb not null,
  unique(user_id,source_key)
);
alter table public.imported_lists enable row level security;
alter table public.imported_list_entries enable row level security;
create policy "Read own imported lists" on public.imported_lists for select to authenticated using(user_id=auth.uid());
create policy "Read own imported list entries" on public.imported_list_entries for select to authenticated using(user_id=auth.uid());
revoke all on public.imported_lists, public.imported_list_entries from anon, authenticated;
grant select on public.imported_lists, public.imported_list_entries to authenticated;
grant all on public.imported_lists, public.imported_list_entries to service_role;

create function public.import_saved_list(p_list jsonb,p_records jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare owner uuid := auth.uid(); destination uuid; prior public.imported_lists;
  item jsonb; summary jsonb; inserted_id uuid; added integer := 0; duplicates integer := 0;
begin
  if owner is null then raise exception 'Sign in first' using errcode='42501'; end if;
  if coalesce(p_list->>'kind','') not in ('custom','watchlist') or coalesce(p_list->>'key','') = '' or
    coalesce(trim(p_list->>'name'),'') = '' or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records)>50 then raise exception 'Invalid list import'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner::text,2));
  if p_list->>'kind'='custom' then
    select * into prior from public.imported_lists where user_id=owner and source_key=p_list->>'key';
    if found then
      destination := prior.list_id;
      if destination is null then return jsonb_build_object('inserted',0,'duplicates',0,'not_imported','deleted_in_plot'); end if;
    else
      if not public.is_premium(owner) and (select count(*) from public.user_custom_lists where user_id=owner)>=5 then
        return jsonb_build_object('inserted',0,'duplicates',0,'not_imported','free_list_limit');
      end if;
      insert into public.user_custom_lists(user_id,name) values(owner,left(trim(p_list->>'name'),200)) returning id into destination;
      insert into public.imported_lists(user_id,source_key,list_id,metadata) values(owner,p_list->>'key',destination,p_list);
    end if;
  else
    insert into public.lists(user_id,name) values(owner,'__watchlist__') on conflict(user_id,name) do nothing;
    select id into destination from public.lists where user_id=owner and name='__watchlist__';
  end if;
  for item in select value from jsonb_array_elements(p_records) loop
    summary := item->'summary';
    if coalesce(item->>'source_key','')='' or coalesce((summary->>'tmdb_id')::integer,0)<=0 or
      coalesce(summary->>'media_type','') not in ('movie','tv') or coalesce(summary->>'title','')='' then raise exception 'Invalid confirmed title'; end if;
    inserted_id := null;
    insert into public.imported_list_entries(user_id,source_key,payload) values(owner,item->>'source_key',item)
      on conflict(user_id,source_key) do nothing returning id into inserted_id;
    if inserted_id is null then duplicates:=duplicates+1; continue; end if;
    inserted_id:=null;
    if p_list->>'kind'='custom' then
      insert into public.user_custom_list_items(list_id,user_id,tmdb_id,media_type,title,poster_path)
        values(destination,owner,(summary->>'tmdb_id')::integer,summary->>'media_type',summary->>'title',summary->>'poster_path')
        on conflict(list_id,tmdb_id) do nothing returning id into inserted_id;
    else
      insert into public.list_items(list_id,user_id,tmdb_id,media_type,title,poster_path)
        values(destination,owner,(summary->>'tmdb_id')::integer,summary->>'media_type',summary->>'title',summary->>'poster_path')
        on conflict(list_id,tmdb_id) do nothing returning id into inserted_id;
    end if;
    if inserted_id is null then duplicates:=duplicates+1; else added:=added+1; end if;
  end loop;
  return jsonb_build_object('inserted',added,'duplicates',duplicates);
end $$;
revoke all on function public.import_saved_list(jsonb,jsonb) from public, anon;
grant execute on function public.import_saved_list(jsonb,jsonb) to authenticated;
