-- Marketing automation system: content calendar, publications, metrics,
-- tracked titles, trending snapshots, newsletter subscribers, platform tokens.
-- All tables are service-role only (RLS enabled, no policies).

-- ── Content calendar ─────────────────────────────────────────────
CREATE TABLE public.marketing_posts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type       text NOT NULL CHECK (post_type IN
                    ('weekly_slate','countdown','now_streaming',
                     'trending_chart','trailer_drop','on_this_day')),
  topic_key       text NOT NULL UNIQUE,          -- idempotency anchor, e.g. 'countdown:t7:movie:550'
  status          text NOT NULL DEFAULT 'planned' CHECK (status IN
                    ('planned','generated','pending_review','published',
                     'partially_published','vetoed','failed','skipped')),
  scheduled_for   timestamptz NOT NULL,          -- intended publish instant (UTC)
  tmdb_refs       jsonb NOT NULL DEFAULT '[]',   -- [{media_type, id, title}] resolved at plan time
  payload         jsonb NOT NULL DEFAULT '{}',   -- planner snapshot the template renders from
  copy            jsonb,                         -- {x, instagram, threads, hashtags, alt_text, cta_variant,
                                                 --  page_title, page_body[]}
  media           jsonb,                         -- [{portrait_path, landscape_path}, ...] index 0 = hero
  slug            text UNIQUE,                   -- permalink on theplot.tv/whats-on/<slug>
  veto_token      text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  veto_expires_at timestamptz,
  vetoed_at       timestamptz,
  digest_sent_at  timestamptz,                   -- null => publisher refuses (fail-closed gate)
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX marketing_posts_status_sched_idx ON public.marketing_posts (status, scheduled_for);

-- ── Per-platform publish attempts (one post fans out to N platforms) ──
CREATE TABLE public.marketing_post_publications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id          uuid NOT NULL REFERENCES public.marketing_posts(id) ON DELETE CASCADE,
  platform         text NOT NULL CHECK (platform IN ('x','instagram','threads')),
  status           text NOT NULL DEFAULT 'queued' CHECK (status IN
                     ('queued','publishing','published','failed','skipped')),
  platform_post_id text,
  permalink        text,
  published_at     timestamptz,
  error            text,
  attempt_count    int NOT NULL DEFAULT 0,
  UNIQUE (post_id, platform)
);

-- ── Metrics time-series ──────────────────────────────────────────
CREATE TABLE public.marketing_metrics (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  publication_id   uuid NOT NULL REFERENCES public.marketing_post_publications(id) ON DELETE CASCADE,
  metric_date      date NOT NULL,                -- collection day; unique pair => idempotent re-runs
  views            int,                          -- views(IG, Threads) / impressions(X, when available)
  likes            int,
  replies          int,                          -- replies(Threads) / comments(IG)
  reposts          int,                          -- reposts+quotes(Threads) / shares(IG)
  saves            int,                          -- IG only
  link_clicks      int,
  raw              jsonb NOT NULL DEFAULT '{}',  -- full platform response, schema-drift insurance
  collected_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id, metric_date)
);

-- ── Countdown / trailer announcement state (don't re-announce) ───
CREATE TABLE public.marketing_tracked_titles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_type      text NOT NULL CHECK (media_type IN ('movie','tv')),
  tmdb_id         int  NOT NULL,
  title           text NOT NULL,
  release_date    date,
  digital_date    date,
  popularity      numeric,
  announced       jsonb NOT NULL DEFAULT '{}',  -- {"t14": post_id, "t7": ..., "t1": ..., "now_streaming": ...}
  known_trailers  jsonb NOT NULL DEFAULT '[]',  -- [youtube_key, ...] already seen
  first_seen_at   timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_type, tmdb_id)
);

-- ── Weekly trending snapshot for week-over-week movement ─────────
CREATE TABLE public.marketing_trending_snapshots (
  snapshot_date  date PRIMARY KEY,
  items          jsonb NOT NULL    -- [{rank, media_type, tmdb_id, title, popularity}]
);

-- ── Newsletter subscribers ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS citext;
CREATE TABLE public.marketing_subscribers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL UNIQUE,
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active','unsubscribed','bounced')),
  unsubscribe_token  text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  source             text NOT NULL DEFAULT 'website',
  created_at         timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at    timestamptz
);

-- ── Refreshable platform tokens (IG/Threads 60-day tokens) ───────
CREATE TABLE public.marketing_tokens (
  platform      text PRIMARY KEY CHECK (platform IN ('instagram','threads')),
  account_id    text NOT NULL,
  access_token  text NOT NULL,
  expires_at    timestamptz NOT NULL,
  refreshed_at  timestamptz NOT NULL DEFAULT now()
);

-- ── Per-template performance (feeds planner tie-breaks + weekly report) ──
CREATE VIEW public.marketing_template_stats AS
SELECT p.post_type,
       p.copy->>'cta_variant' AS cta_variant,
       count(DISTINCT p.id) AS posts,
       avg(m.views) AS avg_views,
       avg((coalesce(m.likes,0) + coalesce(m.replies,0) + coalesce(m.reposts,0) + coalesce(m.saves,0))::numeric
           / nullif(m.views, 0)) AS avg_engagement_rate
FROM public.marketing_posts p
JOIN public.marketing_post_publications pub ON pub.post_id = p.id AND pub.status = 'published'
JOIN LATERAL (
  SELECT * FROM public.marketing_metrics mm
  WHERE mm.publication_id = pub.id
  ORDER BY mm.metric_date DESC LIMIT 1
) m ON true
WHERE p.status IN ('published','partially_published')
  AND p.created_at > now() - interval '28 days'
GROUP BY p.post_type, p.copy->>'cta_variant';

-- ── RLS: deny-all for anon/authenticated; service role bypasses ──
ALTER TABLE public.marketing_posts              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_post_publications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_metrics            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_tracked_titles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_trending_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_subscribers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_tokens             ENABLE ROW LEVEL SECURITY;

-- ── Public bucket for rendered post media (IG/Threads/Buffer need a public URL) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('marketing', 'marketing', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Marketing media is publicly readable"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'marketing');
