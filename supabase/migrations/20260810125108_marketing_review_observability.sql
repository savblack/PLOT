-- In-product observability for the marketing control room:
--   marketing_review_events — append-only audit trail of approve/reject/edit/
--     publish actions, written by both admin-review and the marketing-week
--     skill (the skill bypasses admin-review's code entirely, so it must
--     write its own rows — see marketing/REVIEW.md).
--   marketing_batch_runs — durable run history for the weekly generate and
--     publish jobs, mirroring the shape marketing_learning_runs already
--     proved out for the Sunday learning loop. Unlike that table, a run here
--     isn't unique per week: publish runs every 5 minutes, and generate can
--     be re-triggered (e.g. by "Regenerate"), so this is an append-only log,
--     not a per-week upsert target.

CREATE TABLE public.marketing_review_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid REFERENCES public.marketing_posts(id) ON DELETE SET NULL,
  -- Never a named human: admin-review and the skill both authenticate with
  -- one shared secret, so "actor" can only ever mean which surface acted.
  actor       text NOT NULL CHECK (actor IN ('web_desk', 'marketing_week_skill')),
  action      text NOT NULL,      -- mirrors admin-review's `action` form field: approve, reject, ...
  before      jsonb,
  after       jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_review_events_post_idx ON public.marketing_review_events (post_id, occurred_at DESC);
CREATE INDEX marketing_review_events_occurred_idx ON public.marketing_review_events (occurred_at DESC);

CREATE TABLE public.marketing_batch_runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type    text NOT NULL CHECK (run_type IN ('generate', 'publish')),
  status      text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  counts      jsonb NOT NULL DEFAULT '{}',   -- e.g. {"planned":5,"generated":5,"failed":0}
  error       text,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX marketing_batch_runs_type_started_idx ON public.marketing_batch_runs (run_type, started_at DESC);

-- RLS: deny-all for anon/authenticated; service role bypasses (same
-- convention as every other marketing_* table).
ALTER TABLE public.marketing_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_batch_runs    ENABLE ROW LEVEL SECURITY;
