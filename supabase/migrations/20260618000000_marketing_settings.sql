-- Marketing control-room settings: a single-row table holding the global
-- switches the review desk (admin.theplot.tv) toggles. Today that's just the
-- publish kill switch; room to grow. Service-role only, like the rest of the
-- marketing tables (RLS on, no policies).

CREATE TABLE public.marketing_settings (
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single row
  publishing_paused boolean     NOT NULL DEFAULT false,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.marketing_settings ENABLE ROW LEVEL SECURITY;

-- Seed the singleton so the desk can always update-by-id.
INSERT INTO public.marketing_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
