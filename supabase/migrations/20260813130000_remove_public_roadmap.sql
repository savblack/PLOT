-- Remove the public roadmap schema from Production.
--
-- 20260808000000_public_roadmap.sql was applied to Production but its file only
-- ever existed on branch claude/public-roadmap-579214 — it was never merged to
-- main. That mismatch (a remote version with no local file) made the Supabase
-- integration fail every run with "Remote migration versions not found in local
-- migrations directory", silently blocking newer migrations from reaching
-- Production. It surfaced when 20260813120000 merged green and never applied.
--
-- The feature was built but never shipped: no surface on main references these
-- tables, and both were empty in Production. The 20260808000000 history row has
-- been repaired to 'reverted', so this drops what that migration left behind.
--
-- Recreating it later costs nothing: the original migration is still on its
-- branch, unchanged.

SET search_path TO public, extensions;

DROP FUNCTION IF EXISTS public.get_roadmap_board();

-- Policies and indexes go with the tables. Votes first: it references items.
DROP TABLE IF EXISTS public.roadmap_votes;
DROP TABLE IF EXISTS public.roadmap_items;
