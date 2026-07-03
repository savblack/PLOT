-- Buffer-style operator backend for PLOT marketing.
-- Separate operational domain: drafts, scheduling, approvals, retries, and
-- per-channel publish state. Service-role only, like the existing marketing
-- tables; the internal operator API enforces its own token auth.

SET search_path TO public, extensions;

CREATE TABLE public.operator_posts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL CHECK (source IN ('generated', 'manual')),
  state             text NOT NULL DEFAULT 'draft' CHECK (state IN
                      ('draft','in_review','approved','scheduled',
                       'publishing','published','failed','rejected')),
  topic_key         text UNIQUE,
  legacy_post_type  text NOT NULL DEFAULT 'guide',
  scheduled_for     timestamptz,
  content           jsonb NOT NULL DEFAULT '{}',
  payload           jsonb NOT NULL DEFAULT '{}',
  tmdb_refs         jsonb NOT NULL DEFAULT '[]',
  created_by        text,
  approved_by       text,
  approved_at       timestamptz,
  rejected_by       text,
  rejected_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_posts_state_sched_idx
  ON public.operator_posts (state, scheduled_for);

CREATE TABLE public.operator_post_channel_variants (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.operator_posts(id) ON DELETE CASCADE,
  platform          text NOT NULL CHECK (platform IN ('x','instagram','threads')),
  enabled           boolean NOT NULL DEFAULT true,
  text_override     text,
  first_comment     text,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN
                      ('draft','scheduled','publishing','published','failed','rejected')),
  scheduled_for     timestamptz,
  platform_post_id  text,
  permalink         text,
  last_error        text,
  attempt_count     int NOT NULL DEFAULT 0,
  sent_payload      jsonb,
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, platform)
);

CREATE INDEX operator_variants_status_sched_idx
  ON public.operator_post_channel_variants (status, scheduled_for);

CREATE TABLE public.operator_post_media (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.operator_posts(id) ON DELETE CASCADE,
  sort_order        int NOT NULL DEFAULT 0,
  portrait_path     text,
  landscape_path    text,
  channels          jsonb NOT NULL DEFAULT '["x","instagram","threads"]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, sort_order)
);

CREATE TABLE public.operator_approval_decisions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.operator_posts(id) ON DELETE CASCADE,
  decision          text NOT NULL CHECK (decision IN ('submitted','approved','rejected')),
  actor             text,
  note              text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_approvals_post_created_idx
  ON public.operator_approval_decisions (post_id, created_at DESC);

CREATE TABLE public.operator_post_notes (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.operator_posts(id) ON DELETE CASCADE,
  actor             text,
  body              text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_notes_post_created_idx
  ON public.operator_post_notes (post_id, created_at DESC);

CREATE TABLE public.operator_publish_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.operator_posts(id) ON DELETE CASCADE,
  platform          text NOT NULL CHECK (platform IN ('x','instagram','threads')),
  status            text NOT NULL CHECK (status IN ('published','failed')),
  sent_text         text,
  sent_payload      jsonb,
  response_payload  jsonb,
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX operator_attempts_post_created_idx
  ON public.operator_publish_attempts (post_id, created_at DESC);

CREATE TABLE public.operator_sync_links (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid NOT NULL REFERENCES public.operator_posts(id) ON DELETE CASCADE,
  source_system     text NOT NULL CHECK (source_system IN ('marketing')),
  external_id       text NOT NULL,
  legacy_post_id    uuid REFERENCES public.marketing_posts(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, source_system),
  UNIQUE (source_system, external_id)
);

CREATE TABLE public.operator_channel_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          text NOT NULL CHECK (platform IN ('x','instagram','threads')),
  service           text NOT NULL CHECK (service IN ('twitter','instagram','threads')),
  label             text NOT NULL,
  external_channel_id text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, label)
);

ALTER TABLE public.operator_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_post_channel_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_post_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_post_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_publish_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_sync_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_channel_accounts ENABLE ROW LEVEL SECURITY;
