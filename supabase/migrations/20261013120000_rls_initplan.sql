-- Performance advisor: auth.uid() once per query, and one permissive
-- policy per role and command.
--
-- auth.uid() in a policy runs again for every row the query touches.
-- (select auth.uid()) is the same value, computed once. Supabase documents
-- this as safe to apply everywhere those helpers appear.
--
-- The other warning is several permissive policies for one command.
-- Postgres ORs them, so a row is allowed when any policy allows it.
-- Copies that repeat an existing for-all policy are dropped. Policies that
-- allow different rows are combined with OR. A branch that only signed-in
-- users had stays behind current_user = 'authenticated', so anon and the
-- dashboard roles do not gain it.

-- ── Overlapping policies ────────────────────────────────────────────

-- follows: two delete policies, both public. One select for pending rows
-- (public) and one for accepted rows (authenticated only).
drop policy if exists "following can remove follower" on public.follows;
drop policy if exists "users can unfollow" on public.follows;
drop policy if exists "participants can remove a follow" on public.follows;
create policy "participants can remove a follow"
  on public.follows
  for delete
  to public
  using (
    (select auth.uid()) = follower_id
    or (select auth.uid()) = following_id
  );

drop policy if exists "accepted follows visible to participants" on public.follows;
drop policy if exists "pending follows visible to parties" on public.follows;
drop policy if exists "parties can read follows" on public.follows;
create policy "parties can read follows"
  on public.follows
  for select
  to public
  using (
    (
      status = 'pending'::text
      and (
        (select auth.uid()) = follower_id
        or (select auth.uid()) = following_id
      )
    )
    or (
      (select current_user) = 'authenticated'
      and status = 'accepted'::text
      and (
        (select auth.uid()) = follower_id
        or (select auth.uid()) = following_id
      )
      and private.not_blocked(follower_id)
      and private.not_blocked(following_id)
    )
  );

-- history: own rows are public. Profile visitors are anon and authenticated.
drop policy if exists "Users can see their own journal" on public.history;
drop policy if exists "public profiles history is readable" on public.history;
create policy "public profiles history is readable"
  on public.history
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or (
      (select current_user) in ('anon', 'authenticated')
      and can_view_profile(user_id)
    )
  );

-- lists: "Users manage own lists" is already for all commands, with the
-- same auth.uid() = user_id check as the per-command copies.
drop policy if exists "Users can create own lists" on public.lists;
drop policy if exists "Users can delete own lists" on public.lists;
drop policy if exists "Users can update own lists" on public.lists;
drop policy if exists "Users can view own lists" on public.lists;

-- list_items: the for-all policy cannot grow an OR into the public-read
-- check, or a visitor could write another person's saved titles. Split
-- writes off, and keep the read in the policy the visibility test names.
drop policy if exists "Users manage own list items" on public.list_items;
drop policy if exists "Users can create own list items" on public.list_items;
drop policy if exists "Users can update own list items" on public.list_items;
drop policy if exists "Users can delete own list items" on public.list_items;
drop policy if exists "Users can view own list items" on public.list_items;
drop policy if exists "public profiles list items readable" on public.list_items;
create policy "Users can create own list items"
  on public.list_items
  for insert
  to public
  with check ((select auth.uid()) = user_id);
create policy "Users can update own list items"
  on public.list_items
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own list items"
  on public.list_items
  for delete
  to public
  using ((select auth.uid()) = user_id);
create policy "public profiles list items readable"
  on public.list_items
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or (
      (select current_user) in ('anon', 'authenticated')
      and private.can_view_watchlist(user_id)
    )
  );

-- Favourites, top lists, and watching progress match list_items: a public
-- for-all own-row policy plus a profile-visitor select.
drop policy if exists "Users manage own favourites" on public.user_favourites;
drop policy if exists "Users insert own favourites" on public.user_favourites;
drop policy if exists "Users update own favourites" on public.user_favourites;
drop policy if exists "Users delete own favourites" on public.user_favourites;
drop policy if exists "public profiles favourites readable" on public.user_favourites;
create policy "Users insert own favourites"
  on public.user_favourites
  for insert
  to public
  with check ((select auth.uid()) = user_id);
create policy "Users update own favourites"
  on public.user_favourites
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own favourites"
  on public.user_favourites
  for delete
  to public
  using ((select auth.uid()) = user_id);
create policy "public profiles favourites readable"
  on public.user_favourites
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or (
      (select current_user) in ('anon', 'authenticated')
      and can_view_profile(user_id)
    )
  );

drop policy if exists "Users manage own top lists" on public.user_top_lists;
drop policy if exists "Users insert own top lists" on public.user_top_lists;
drop policy if exists "Users update own top lists" on public.user_top_lists;
drop policy if exists "Users delete own top lists" on public.user_top_lists;
drop policy if exists "public profiles top lists readable" on public.user_top_lists;
create policy "Users insert own top lists"
  on public.user_top_lists
  for insert
  to public
  with check ((select auth.uid()) = user_id);
create policy "Users update own top lists"
  on public.user_top_lists
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own top lists"
  on public.user_top_lists
  for delete
  to public
  using ((select auth.uid()) = user_id);
create policy "public profiles top lists readable"
  on public.user_top_lists
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or (
      (select current_user) in ('anon', 'authenticated')
      and can_view_profile(user_id)
    )
  );

drop policy if exists "Users can manage their own watching progress" on public.watching_progress;
drop policy if exists "Users insert own watching progress" on public.watching_progress;
drop policy if exists "Users update own watching progress" on public.watching_progress;
drop policy if exists "Users delete own watching progress" on public.watching_progress;
drop policy if exists "public profiles watching progress readable" on public.watching_progress;
create policy "Users insert own watching progress"
  on public.watching_progress
  for insert
  to public
  with check ((select auth.uid()) = user_id);
create policy "Users update own watching progress"
  on public.watching_progress
  for update
  to public
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete own watching progress"
  on public.watching_progress
  for delete
  to public
  using ((select auth.uid()) = user_id);
create policy "public profiles watching progress readable"
  on public.watching_progress
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or (
      (select current_user) in ('anon', 'authenticated')
      and can_view_profile(user_id)
    )
  );

-- Custom lists: own rows and the public-list rule are public. Membership
-- is authenticated only.
drop policy if exists "Members read shared lists" on public.user_custom_lists;
drop policy if exists "Public custom lists are readable" on public.user_custom_lists;
drop policy if exists "Users read own custom lists" on public.user_custom_lists;
create policy "Public custom lists are readable"
  on public.user_custom_lists
  for select
  to public
  using (
    (select auth.uid()) = user_id
    or can_view_custom_list(user_id, visibility)
    or (
      (select current_user) = 'authenticated'
      and private.is_custom_list_member(id)
    )
  );

drop policy if exists "Users manage own custom list items" on public.user_custom_list_items;
drop policy if exists "Users insert own custom list items" on public.user_custom_list_items;
drop policy if exists "Users update own custom list items" on public.user_custom_list_items;
drop policy if exists "Users delete own custom list items" on public.user_custom_list_items;
drop policy if exists "Items of public custom lists are readable" on public.user_custom_list_items;
drop policy if exists "Members read shared list items" on public.user_custom_list_items;
create policy "Users insert own custom list items"
  on public.user_custom_list_items
  for insert
  to authenticated
  with check ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = user_custom_list_items.list_id) AND (l.user_id = (select auth.uid())))))));
create policy "Users update own custom list items"
  on public.user_custom_list_items
  for update
  to authenticated
  using ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = user_custom_list_items.list_id) AND (l.user_id = (select auth.uid())))))))
  with check ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = user_custom_list_items.list_id) AND (l.user_id = (select auth.uid())))))));
create policy "Users delete own custom list items"
  on public.user_custom_list_items
  for delete
  to authenticated
  using ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = user_custom_list_items.list_id) AND (l.user_id = (select auth.uid())))))));
create policy "Items of public custom lists are readable"
  on public.user_custom_list_items
  for select
  to public
  using (
    (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = user_custom_list_items.list_id) AND can_view_custom_list(l.user_id, l.visibility))))
    or (
      (select current_user) = 'authenticated'
      and (
        (((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = user_custom_list_items.list_id) AND (l.user_id = (select auth.uid()))))))
        or private.is_custom_list_member(list_id)
      )
    )
  );

-- ── Remaining policies: wrap auth.uid() ─────────────────────────────

alter policy "own episode alert mutes deletable" on public.episode_alert_mutes
  using (((select auth.uid()) = user_id));

alter policy "own episode alert mutes insertable" on public.episode_alert_mutes
  with check (((select auth.uid()) = user_id));

alter policy "own episode alert mutes readable" on public.episode_alert_mutes
  using (((select auth.uid()) = user_id));

alter policy "episode_overrides_owner" on public.episode_watch_overrides
  using ((user_id = (select auth.uid())))
  with check ((user_id = (select auth.uid())));

alter policy "Authenticated users can submit feedback" on public.feedback
  with check ((user_id = (select auth.uid())));

alter policy "following can update requests" on public.follows
  using ((((select auth.uid()) = following_id) AND (status = 'pending'::text)))
  with check ((((select auth.uid()) = following_id) AND (status = 'accepted'::text)));

alter policy "users can follow others" on public.follows
  with check ((((select auth.uid()) = follower_id) AND private.not_blocked(following_id)));

alter policy "Users can delete their own journal" on public.history
  using (((select auth.uid()) = user_id));

alter policy "Users can insert their own journal" on public.history
  with check (((select auth.uid()) = user_id));

alter policy "Users can update their own journal" on public.history
  using (((select auth.uid()) = user_id));

alter policy "Read own imported annotations" on public.imported_annotations
  using ((user_id = (select auth.uid())));

alter policy "Read own imported list entries" on public.imported_list_entries
  using ((user_id = (select auth.uid())));

alter policy "Read own imported lists" on public.imported_lists
  using ((user_id = (select auth.uid())));

alter policy "Users can read own integration items" on public.integration_items
  using (((select auth.uid()) = user_id));

alter policy "Users can update own integration items" on public.integration_items
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "Users can create own integration outbox" on public.integration_outbox
  with check (((select auth.uid()) = user_id));

alter policy "Users can read own integration outbox" on public.integration_outbox
  using (((select auth.uid()) = user_id));

alter policy "Users can update own integration outbox" on public.integration_outbox
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "Users manage own lists" on public.lists
  using (((select auth.uid()) = user_id));

alter policy "Users can create own media integrations" on public.media_integrations
  with check (((select auth.uid()) = user_id));

alter policy "Users can read own media integrations" on public.media_integrations
  using (((select auth.uid()) = user_id));

alter policy "Users can update own media integrations" on public.media_integrations
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "own streaming mutes deletable" on public.movie_streaming_alert_mutes
  using (((select auth.uid()) = user_id));

alter policy "own streaming mutes insertable" on public.movie_streaming_alert_mutes
  with check ((((select auth.uid()) = user_id) AND (( SELECT count(*) AS count
   FROM movie_streaming_alert_mutes m
  WHERE (m.user_id = (select auth.uid()))) < 2000)));

alter policy "own streaming mutes readable" on public.movie_streaming_alert_mutes
  using (((select auth.uid()) = user_id));

alter policy "own notification preferences insertable" on public.notification_preferences
  with check (((select auth.uid()) = user_id));

alter policy "own notification preferences readable" on public.notification_preferences
  using (((select auth.uid()) = user_id));

alter policy "own notification preferences updatable" on public.notification_preferences
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "own notifications deletable" on public.notifications
  using (((select auth.uid()) = user_id));

alter policy "own notifications readable" on public.notifications
  using (((select auth.uid()) = user_id));

alter policy "own notifications updatable" on public.notifications
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "own person alerts deletable" on public.person_alerts
  using (((select auth.uid()) = user_id));

alter policy "own person alerts readable" on public.person_alerts
  using (((select auth.uid()) = user_id));

alter policy "premium person alerts insertable" on public.person_alerts
  with check ((((select auth.uid()) = user_id) AND is_premium() AND (( SELECT count(*) AS count
   FROM person_alerts a
  WHERE (a.user_id = (select auth.uid()))) < 500)));

alter policy "users can insert own profile" on public.profiles
  with check (((select auth.uid()) = id));

alter policy "users can read own profile" on public.profiles
  using (((select auth.uid()) = id));

alter policy "users can update own profile" on public.profiles
  using (((select auth.uid()) = id));

alter policy "own push tokens deletable" on public.push_tokens
  using (((select auth.uid()) = user_id));

alter policy "own push tokens readable" on public.push_tokens
  using (((select auth.uid()) = user_id));

alter policy "Users can create own reminders" on public.reminders
  with check (((select auth.uid()) = user_id));

alter policy "Users can delete own reminders" on public.reminders
  using (((select auth.uid()) = user_id));

alter policy "Users can view own reminders" on public.reminders
  using (((select auth.uid()) = user_id));

alter policy "own reports readable" on public.reports
  using (((select auth.uid()) = reporter_id));

alter policy "users can report" on public.reports
  with check ((((select auth.uid()) = reporter_id) AND (reporter_id <> reported_id)));

alter policy "own season alerts deletable" on public.season_ready_alerts
  using (((select auth.uid()) = user_id));

alter policy "own season alerts readable" on public.season_ready_alerts
  using (((select auth.uid()) = user_id));

alter policy "premium season alerts insertable" on public.season_ready_alerts
  with check ((((select auth.uid()) = user_id) AND is_premium() AND (( SELECT count(*) AS count
   FROM season_ready_alerts a
  WHERE (a.user_id = (select auth.uid()))) < 500)));

alter policy "Owners add seen rows to their smart lists" on public.smart_list_seen
  with check ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = smart_list_seen.list_id) AND (l.user_id = (select auth.uid())) AND (l.rules IS NOT NULL))))));

alter policy "Owners delete their smart list seen rows" on public.smart_list_seen
  using (((select auth.uid()) = user_id));

alter policy "Owners read their smart list seen rows" on public.smart_list_seen
  using (((select auth.uid()) = user_id));

alter policy "Owners update their smart list seen rows" on public.smart_list_seen
  using (((select auth.uid()) = user_id))
  with check ((((select auth.uid()) = user_id) AND (EXISTS ( SELECT 1
   FROM user_custom_lists l
  WHERE ((l.id = smart_list_seen.list_id) AND (l.user_id = (select auth.uid())) AND (l.rules IS NOT NULL))))));

alter policy "tracking_connections_owner_read" on public.tracking_connections
  using ((user_id = (select auth.uid())));

alter policy "Read own imported memberships" on public.tracking_import_items
  using ((user_id = (select auth.uid())));

alter policy "tracking_jobs_owner_read" on public.tracking_jobs
  using ((user_id = (select auth.uid())));

alter policy "tracking_review_owner_read" on public.tracking_review_items
  using ((user_id = (select auth.uid())));

alter policy "own blocks readable" on public.user_blocks
  using (((select auth.uid()) = blocker_id));

alter policy "users can block" on public.user_blocks
  with check (((select auth.uid()) = blocker_id));

alter policy "users can unblock" on public.user_blocks
  using (((select auth.uid()) = blocker_id));

alter policy "Users create custom lists within plan cap" on public.user_custom_lists
  with check ((((select auth.uid()) = user_id) AND can_create_custom_list()));

alter policy "Users delete own custom lists" on public.user_custom_lists
  using (((select auth.uid()) = user_id));

alter policy "Users update own custom lists" on public.user_custom_lists
  using (((select auth.uid()) = user_id))
  with check (((select auth.uid()) = user_id));

alter policy "watch together visible to both people" on public.watch_together
  using (((((select auth.uid()) = requester_id) AND private.not_blocked(recipient_id)) OR (((select auth.uid()) = recipient_id) AND private.not_blocked(requester_id))));

alter policy "own availability alerts readable" on public.watchlist_availability_alerts
  using (((select auth.uid()) = user_id));

alter policy "owners read their watchlist viewers" on public.watchlist_viewers
  using ((owner_id = (select auth.uid())));

-- Fail if a public policy still calls auth.uid() per row, or if any
-- permissive policies still overlap for one role and command.
do $guard$
declare
  bare text;
  overlap text;
  history_expr text;
  items_expr text;
begin
  select string_agg(format('%s.%s', c.relname, pol.polname), ', ' order by c.relname, pol.polname)
    into bare
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and (
      (
        lower(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) like '%auth.uid()%'
        and lower(coalesce(pg_get_expr(pol.polqual, pol.polrelid), '')) not like '%select auth.uid()%'
      )
      or (
        lower(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) like '%auth.uid()%'
        and lower(coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) not like '%select auth.uid()%'
      )
    );
  if bare is not null then
    raise exception 'bare auth.uid() remains in %', bare;
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid)
    into history_expr
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  where c.relname = 'history' and pol.polname = 'public profiles history is readable';
  if history_expr is null or position('can_view_profile' in history_expr) = 0 then
    raise exception 'history read policy lost can_view_profile';
  end if;

  select pg_get_expr(pol.polqual, pol.polrelid)
    into items_expr
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  where c.relname = 'list_items' and pol.polname = 'public profiles list items readable';
  if items_expr is null
     or position('can_view_watchlist' in items_expr) = 0
     or position('can_view_profile' in items_expr) > 0 then
    raise exception 'list item read policy must use can_view_watchlist only';
  end if;

  with pol as (
    select c.relname as table_name, p.polname, p.polcmd, p.polroles
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and p.polpermissive
  ), expanded as (
    select pol.table_name, r.rolname, act.cmd
    from pol
    join pg_roles r
      on pol.polroles @> array[r.oid]
      or pol.polroles = array[0::oid]
    cross join lateral (
      select unnest(
        case pol.polcmd
          when 'r' then array['SELECT']
          when 'a' then array['INSERT']
          when 'w' then array['UPDATE']
          when 'd' then array['DELETE']
          when '*' then array['SELECT', 'INSERT', 'UPDATE', 'DELETE']
        end
      ) as cmd
    ) act
    where r.rolname not like 'pg\_%'
      and r.rolname not like 'supabase%admin'
      and not r.rolbypassrls
  )
  select string_agg(format('%s %s %s', table_name, rolname, cmd), ', ' order by table_name, rolname, cmd)
    into overlap
  from (
    select table_name, rolname, cmd
    from expanded
    group by table_name, rolname, cmd
    having count(*) > 1
  ) s;
  if overlap is not null then
    raise exception 'multiple permissive policies remain for %', overlap;
  end if;
end
$guard$;
