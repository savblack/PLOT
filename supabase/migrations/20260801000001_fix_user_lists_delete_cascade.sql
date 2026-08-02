-- The user_id FKs on these tables were created without ON DELETE CASCADE,
-- so deleting a user from auth.users fails with a foreign key violation
-- whenever they have any top list, favourite, or custom list rows.

alter table user_top_lists
  drop constraint user_top_lists_user_id_fkey,
  add constraint user_top_lists_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table user_favourites
  drop constraint user_favourites_user_id_fkey,
  add constraint user_favourites_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table user_custom_lists
  drop constraint user_custom_lists_user_id_fkey,
  add constraint user_custom_lists_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;

alter table user_custom_list_items
  drop constraint user_custom_list_items_user_id_fkey,
  add constraint user_custom_list_items_user_id_fkey
    foreign key (user_id) references auth.users (id) on delete cascade;
