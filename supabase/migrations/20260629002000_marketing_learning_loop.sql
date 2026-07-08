-- Sunday learning loop support:
--   generated_copy snapshots on posts
--   sent_text / sent_payload snapshots on per-platform publications
--   newsletter issue logging
--   weekly learning-run artifacts

SET search_path TO public, extensions;

ALTER TABLE public.marketing_posts
  ADD COLUMN IF NOT EXISTS generated_copy jsonb;

ALTER TABLE public.marketing_post_publications
  ADD COLUMN IF NOT EXISTS sent_text text,
  ADD COLUMN IF NOT EXISTS sent_payload jsonb;

CREATE TABLE IF NOT EXISTS public.marketing_newsletter_issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start      date NOT NULL UNIQUE,
  issue_date      date NOT NULL,
  subject         text NOT NULL,
  html            text NOT NULL,
  snapshot        jsonb NOT NULL DEFAULT '{}',
  recipient_count int NOT NULL DEFAULT 0,
  sent_at         timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.marketing_learning_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start       date NOT NULL UNIQUE,
  week_end         date NOT NULL,
  status           text NOT NULL DEFAULT 'prepared' CHECK (status IN ('prepared','applied','failed')),
  artifact         jsonb NOT NULL DEFAULT '{}',
  summary_markdown text,
  summary_path     text,
  prepared_at      timestamptz,
  applied_at       timestamptz,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS marketing_learning_runs_status_idx
  ON public.marketing_learning_runs (status, week_start DESC);

ALTER TABLE public.marketing_newsletter_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_learning_runs ENABLE ROW LEVEL SECURITY;
