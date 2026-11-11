-- Shared accounts for the Staging SQL tests. scripts/staging-test.mjs loads
-- this inside every test's transaction, after pending migrations and before the
-- test, so the rollback removes anything created here.
--
-- The tests name three accounts by id: A, B and C (see staging-block-test.sql).
-- They were hand-made Staging accounts, and in November 2026 C turned out to
-- have been deleted, which broke every test that used it with a foreign-key
-- error on `follows`. Creating whichever is missing here means a deleted
-- account costs nothing: the suite stops depending on Staging's people.
--
-- `on conflict do nothing` leaves an existing account exactly as it is. The
-- on_auth_user_created trigger gives a new one its profile.
insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('467ce784-39eb-480e-8593-4632667fc9c3', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plot-staging-test-a@example.invalid', '{}', '{}', now(), now()),
  ('e4e955fb-19f0-4e7d-b234-29c8eafa88fb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plot-staging-test-b@example.invalid', '{}', '{}', now(), now()),
  ('6afcff23-4194-4724-af1b-08328ff81f48', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'plot-staging-test-c@example.invalid', '{}', '{}', now(), now())
on conflict (id) do nothing;
