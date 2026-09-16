-- Genres on the two saved-title tables that never had them, so My Lists'
-- type + genre filter can answer "what horror have I saved" for Favourites
-- and custom lists the way it already does for Want to Watch (list_items)
-- and History.
--
-- Same shape as list_items.genre_ids (20260523010000): not null, empty by
-- default, so a row without genres reads as "unknown" and the shared
-- filterByGenre keeps it rather than dropping it. Existing rows are filled
-- from TMDB by scripts/backfill-genre-ids.mjs, which now covers both tables;
-- new rows are written with genres by saveFavorite and useCustomLists.addItem.
--
-- Additive only: no function is redefined, no constraint changes.

alter table user_favourites
  add column if not exists genre_ids integer[] not null default '{}';

alter table user_custom_list_items
  add column if not exists genre_ids integer[] not null default '{}';
