-- Remove all in-app AI: the taste-profile / journal Edge Functions and their
-- supporting DB objects have been deleted. These drops are idempotent so they
-- are correct whether or not 20260621000000_add_ai_usage_limit.sql was applied
-- to production.
drop function if exists public.increment_ai_usage(text, integer);
drop table if exists public.ai_usage;
alter table public.profiles drop column if exists taste_profile;
