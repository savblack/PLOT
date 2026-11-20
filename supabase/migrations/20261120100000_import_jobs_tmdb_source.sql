-- Allow 'tmdb' as an import_jobs source: a person signs in to TMDB once, the
-- tmdb-account edge function reads their watchlist, lists and ratings, and the
-- app uploads that as a file job (kind 'file'), which the import-worker runs
-- like any other export.
--
-- Additive only: the check is re-created with every existing value plus
-- 'tmdb', so no current row can fail it. The enqueue RPCs need no change:
-- enqueue_file_import_job (20261111090000) refuses only the connection
-- sources, and the table check is what limits the rest.
--
-- import_jobs is small; lock_timeout makes this fail fast rather than queue
-- behind a long transaction. If it fails it rolls back and changes nothing.

set lock_timeout = '5s';

alter table public.import_jobs
  drop constraint import_jobs_source_check;

alter table public.import_jobs
  add constraint import_jobs_source_check check (source in (
    'letterboxd','netflix','prime','disney','max','apple','imdb','trakt-export','tvtime','trakt','plex','simkl','tmdb'
  ));
