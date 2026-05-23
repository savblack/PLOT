-- ─────────────────────────────────────────────────────────────────
-- reminders: EPG programmes the user has marked for their calendar.
-- Keyed by TVMaze episode id so adding the same ep twice is a no-op.
-- ─────────────────────────────────────────────────────────────────

create table if not exists reminders (
  id             uuid        primary key default gen_random_uuid(),
  user_id        uuid        not null references auth.users(id) on delete cascade,
  tvmaze_ep_id   integer     not null,
  show_name      text        not null,
  network_name   text,
  air_date       date        not null,
  air_time       text,        -- "HH:MM" local time
  runtime        integer,     -- minutes
  created_at     timestamptz default now(),
  unique(user_id, tvmaze_ep_id)
);

alter table reminders enable row level security;

drop policy if exists "Users can view own reminders"   on reminders;
drop policy if exists "Users can create own reminders" on reminders;
drop policy if exists "Users can delete own reminders" on reminders;

create policy "Users can view own reminders"
  on reminders for select
  using (auth.uid() = user_id);

create policy "Users can create own reminders"
  on reminders for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own reminders"
  on reminders for delete
  using (auth.uid() = user_id);
