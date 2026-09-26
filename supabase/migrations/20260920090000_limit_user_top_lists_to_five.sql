-- Personal ranked lists now contain five titles per media type on every client.
-- Remove legacy ranks before narrowing the database constraint so older
-- environments cannot retain or recreate hidden ranks 6-10.
delete from public.user_top_lists
where rank > 5;

alter table public.user_top_lists
  drop constraint user_top_lists_rank_check,
  add constraint user_top_lists_rank_check check (rank between 1 and 5);
