-- Notify a comment's author when someone likes their comment.
-- Reuses the forge-proof pattern: a SECURITY DEFINER trigger is the only writer,
-- self-likes don't notify, and post_id carries the post context for the UI.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('follow_request', 'follow_accepted', 'new_follower',
                  'post_like', 'post_comment', 'comment_like'));

create or replace function public.notify_comment_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_author uuid; v_post uuid;
begin
  select user_id, post_id into v_author, v_post from public.post_comments where id = new.comment_id;
  if v_author is not null and v_author <> new.user_id then
    insert into public.notifications (user_id, type, actor_id, post_id)
      values (v_author, 'comment_like', new.user_id, v_post);
  end if;
  return null;
end;
$$;
drop trigger if exists trg_notify_comment_like on public.comment_likes;
create trigger trg_notify_comment_like after insert on public.comment_likes
  for each row execute function public.notify_comment_like();
