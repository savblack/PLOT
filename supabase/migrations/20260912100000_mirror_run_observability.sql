-- Make the Linear surface observable. Two gaps, both invisible by construction.
--
-- 1. marketing_review_events.actor did not allow 'linear'.
--
--    marketing-linear-sync writes an audit row for every approve, reject, edit
--    and reschedule that arrives from a Linear comment — and every one of those
--    inserts was failing with 23514. The write is wrapped defensively so a
--    logging failure cannot block the action it describes, which is right, and
--    which is also why nothing surfaced: the decisions applied, the trail did
--    not record them. REVIEW.md calls an unlogged action "a permanent blind spot
--    in the trail, not a cosmetic gap" — this was that, for an entire surface.
--
-- 2. There was no record that the mirror sweep runs at all.
--
--    marketing-linear-mirror is a pg_cron job every 5 minutes. A sweep with
--    nothing to do wrote nothing anywhere, so "is the mirror alive?" could only
--    be answered by arming a post and waiting for a tick to pick it up. Now each
--    sweep lands in marketing_batch_runs, and the newest row's timestamp is the
--    answer: older than ~10 minutes means the schedule has stopped.
--
--    'idle' is a real outcome rather than a flavour of success — it is what most
--    sweeps are, and separating it is what lets the function prune its own
--    heartbeats without touching runs that did work or failed.

ALTER TABLE public.marketing_review_events
  DROP CONSTRAINT IF EXISTS marketing_review_events_actor_check;

ALTER TABLE public.marketing_review_events
  ADD CONSTRAINT marketing_review_events_actor_check
  CHECK (actor IN ('web_desk', 'marketing_week_skill', 'linear'));

ALTER TABLE public.marketing_batch_runs
  DROP CONSTRAINT IF EXISTS marketing_batch_runs_run_type_check;

ALTER TABLE public.marketing_batch_runs
  ADD CONSTRAINT marketing_batch_runs_run_type_check
  CHECK (run_type IN ('generate', 'publish', 'linear_mirror'));

ALTER TABLE public.marketing_batch_runs
  DROP CONSTRAINT IF EXISTS marketing_batch_runs_status_check;

ALTER TABLE public.marketing_batch_runs
  ADD CONSTRAINT marketing_batch_runs_status_check
  CHECK (status IN ('running', 'succeeded', 'idle', 'failed'));

-- The sweep prunes its own idle heartbeats; this keeps that delete cheap as the
-- table fills with ~288 rows a day.
CREATE INDEX IF NOT EXISTS marketing_batch_runs_type_status_started_idx
  ON public.marketing_batch_runs (run_type, status, started_at);
