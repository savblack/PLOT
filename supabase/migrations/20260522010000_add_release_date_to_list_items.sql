-- list_items is missing release_date which useWatchlist inserts on every save.
-- This causes every INSERT to fail with "column does not exist".
alter table list_items
  add column if not exists release_date text;
