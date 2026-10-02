-- Smart lists extras (PLO-513): a per-list switch for the weekly roll-up.
--
-- Additive only: one column with a default. No function, policy, trigger or
-- constraint is created or recreated, and no existing row changes meaning:
-- every list reads true, so the roll-up includes exactly what it did before.
--
-- user_custom_lists.digest_enabled: whether smart-list-digest
-- (supabase/functions/smart-list-digest, run_smart_list_digest() from
-- 20261002180000_smart_list_digest.sql) checks this list. Only meaningful on a
-- smart list whose source is new discoveries; on any other list it is unread.
-- The owner flips it on the list's page (packages/core/useCustomLists.js
-- setSmartListDigest) through the existing owner update policy. The
-- validate_smart_list trigger only gates a change of `rules`, so a lapsed
-- Premium owner can still switch a list out. Someone with every list switched
-- off gets no roll-up at all.
--
-- A constant default on Postgres 11+ is a catalogue change, not a table rewrite.

alter table public.user_custom_lists
  add column if not exists digest_enabled boolean not null default true;

comment on column public.user_custom_lists.digest_enabled is
  'Smart lists only: whether the weekly roll-up (smart-list-digest) checks this list. Default true. packages/core/smartLists.js smartListInRollUp.';
