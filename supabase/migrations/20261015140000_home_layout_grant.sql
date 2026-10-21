-- profiles.home_layout (20261015130000) is the viewer's own Home layout, but
-- 20261014110000 made the writable column set an explicit grant, so the new
-- column was read-only: every save from Customize Home failed. List it.
grant update (home_layout) on public.profiles to authenticated;
