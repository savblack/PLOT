-- Mobile-app launch waitlist — kept separate from the marketing newsletter
-- (public.marketing_subscribers) so app "notify me" signups can be emailed on
-- their own. Service-role only, matching the marketing tables (RLS on, no
-- policies; the edge function uses the service-role key which bypasses RLS).

SET search_path TO public, extensions;

CREATE TABLE public.app_waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       citext NOT NULL UNIQUE,
  source      text NOT NULL DEFAULT 'website',
  notified_at timestamptz,                       -- set when the launch email goes out
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_waitlist ENABLE ROW LEVEL SECURITY;
