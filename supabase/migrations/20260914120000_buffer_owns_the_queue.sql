-- Social scheduling moves from this pipeline into Buffer.
--
-- The publisher used to send: it woke at noon Sydney, posted approved copy to
-- each platform, and wrote the result down in the same breath. Every status a
-- publication row could hold described a moment inside that one run.
--
-- It no longer sends. The week is pushed into Buffer as scheduled posts as soon
-- as it is rendered, reviewed and adjusted there, and sent by Buffer. That
-- leaves two states the old vocabulary has no word for:
--
--   scheduled — handed to Buffer, due at a known time, not sent yet. The row is
--               live but the outcome is days away, which 'queued' (not handed
--               over) and 'publishing' (a request in flight) both misdescribe.
--
--   canceled  — you deleted or parked it in Buffer. NOT a failure, and the
--               difference matters: 'failed' rows are what --retry-failed picks
--               up, so filing a deliberate deletion as a failure would push back
--               the exact post you just removed.
ALTER TABLE public.marketing_post_publications
  DROP CONSTRAINT IF EXISTS marketing_post_publications_status_check;

ALTER TABLE public.marketing_post_publications
  ADD CONSTRAINT marketing_post_publications_status_check
  CHECK (status IN ('queued','publishing','scheduled','published','failed','skipped','canceled'));

-- The reconcile sweep looks up rows by the Buffer post id it stored at push
-- time, once a day, across every post still waiting. Without this it is a
-- sequential scan of the whole table per run.
CREATE INDEX IF NOT EXISTS marketing_post_publications_scheduled_idx
  ON public.marketing_post_publications (status)
  WHERE status = 'scheduled';

-- The daily run split in two, so its run records did too. 'publish' is kept
-- rather than renamed: there are months of real rows carrying it, and rewriting
-- history to match today's vocabulary would make old runs claim to have done
-- something they did not.
ALTER TABLE public.marketing_batch_runs
  DROP CONSTRAINT IF EXISTS marketing_batch_runs_run_type_check;

ALTER TABLE public.marketing_batch_runs
  ADD CONSTRAINT marketing_batch_runs_run_type_check
  CHECK (run_type IN ('generate', 'publish', 'schedule', 'reconcile', 'linear_mirror'));
