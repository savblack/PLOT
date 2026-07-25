-- SUS-65: Top 10 rank swaps must not violate the unique (user_id, list_type, rank)
-- constraint. The client previously did delete-then-insert across two round
-- trips, which is non-atomic (a failed insert loses both rows). Make the
-- rank constraint deferrable and swap ranks atomically inside a single
-- function call so the intermediate (still-duplicated) state during the
-- swap is only checked at transaction end, once both ranks are final.

alter table user_top_lists
  drop constraint user_top_lists_user_id_list_type_rank_key;

alter table user_top_lists
  add constraint user_top_lists_user_id_list_type_rank_key
  unique (user_id, list_type, rank) deferrable initially immediate;

create or replace function swap_top_list_ranks(
  p_user_id   uuid,
  p_list_type text,
  p_rank_a    integer,
  p_rank_b    integer
) returns void
language plpgsql
security invoker
as $$
begin
  set constraints user_top_lists_user_id_list_type_rank_key deferred;

  update user_top_lists
  set rank = case when rank = p_rank_a then p_rank_b else p_rank_a end
  where user_id = p_user_id
    and list_type = p_list_type
    and rank in (p_rank_a, p_rank_b);
end;
$$;

grant execute on function swap_top_list_ranks(uuid, text, integer, integer) to authenticated;
