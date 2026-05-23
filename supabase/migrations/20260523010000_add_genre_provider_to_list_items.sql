-- Store genre IDs and provider IDs on list items so client-side filtering works
-- without extra API calls per item.
alter table list_items
  add column if not exists genre_ids    integer[] not null default '{}',
  add column if not exists provider_ids integer[] not null default '{}';
