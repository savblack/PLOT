-- profiles.ui_prefs: how the app looks and is arranged for one person.
-- { density: 'comfy' | 'compact', cardStyle: 'poster' | 'list', sidebar: text[] }.
-- Null means the defaults. Shape and validation live in packages/core/uiPrefs.js;
-- the row is written only through updateProfile.
alter table public.profiles add column if not exists ui_prefs jsonb;
comment on column public.profiles.ui_prefs is 'Density, card style and sidebar order: { density, cardStyle, sidebar }. Null = defaults.';

-- Profiles' writable columns are an explicit grant (20261014110000), so the
-- new column is read-only until it is listed.
grant update (ui_prefs) on public.profiles to authenticated;
