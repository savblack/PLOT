-- Serialize inserts for each owner so simultaneous requests cannot exceed the cap.
-- Existing lists, edits and deletions remain available above the allowance.
create function public.enforce_custom_list_creation_cap()
returns trigger
language plpgsql volatile security definer
set search_path = public
as $$
begin
  -- RLS still handles identity/ownership. Do not expose another owner's count.
  if auth.uid() is null or new.user_id is distinct from auth.uid() then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 9175));
  if not public.is_premium()
     and (select count(*) from public.user_custom_lists where user_id = new.user_id) >= 5 then
    raise exception using errcode = 'P0001', message = 'custom_list_limit_reached';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_custom_list_creation_cap() from public;
create trigger enforce_custom_list_creation_cap
before insert on public.user_custom_lists
for each row execute function public.enforce_custom_list_creation_cap();
