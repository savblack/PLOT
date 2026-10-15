-- Home layout: the viewer's shelf order and hidden shelves on Home.
-- Null means the default layout. Shape and validation live in
-- packages/core/homeLayout.js; the row is written only through updateProfile.
alter table public.profiles add column if not exists home_layout jsonb;
comment on column public.profiles.home_layout is 'Home shelf order and hidden shelves: { order: text[], hidden: text[] }. Null = default.';
