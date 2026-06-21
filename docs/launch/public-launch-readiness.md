# PLOT Public Launch Readiness

Last reviewed: 2026-06-21

This document is the launch source of truth for the remaining public-release tickets in the `PLOT Web App` Linear project. It records the production checks that were verified live, the release decisions made for first launch, and the rollback/support plan.

## Open public launch hardening (2026-06-21)

The original launch shape was an invite-only beta (≤50). For an **open** public launch — anyone can sign up — the following abuse/scale gaps were closed in code and must be paired with the dashboard/ops steps below.

Code changes (this repo):

- **Bot-signup protection.** Auth forms now render a Cloudflare Turnstile widget and pass `captchaToken` on signup, login, password reset, and resend (`src/components/Turnstile.jsx`, `src/pages/AuthPage.jsx`). The widget is a no-op until `VITE_TURNSTILE_SITE_KEY` is set, so it stays inert in local dev and CI.
- **`tmdb-proxy` lockdown.** CORS is restricted to `*.theplot.tv`, localhost, and `*.vercel.app`; cross-site browser origins get a 403; a best-effort in-memory per-IP rate limit (100 req / 10s) guards the shared TMDB quota (`supabase/functions/tmdb-proxy/index.ts`).
- **Per-user daily cap on Claude functions.** `generate-taste-profile` and `generate-journal` call the `increment_ai_usage` RPC (migration `20260621000000_add_ai_usage_limit.sql`) and return 429 past 20 uses/user/day; CORS tightened to match the proxy. Fails open if the RPC is absent so onboarding never breaks.
- **CI now runs `node --test tests/unit/*.test.js`** so the existing unit coverage gates merges (`.github/workflows/ci.yml`).

Ops / dashboard steps required before flipping signups open (NOT in code):

- Supabase Auth → Bot & Abuse Protection: enable Cloudflare Turnstile and set the **secret** key (the **site** key goes in Vercel as `VITE_TURNSTILE_SITE_KEY`).
- Supabase Auth → SMTP: point at Resend (`RESEND_API_KEY` + verified `theplot.tv` already exist). The built-in Supabase email sender is rate-limited and not for production — confirmation and reset emails will throttle under public volume without this.
- Confirm Supabase Auth's built-in rate limits (sign-in / sign-up / email) are at production-appropriate values.
- Vercel: add `VITE_TURNSTILE_SITE_KEY`. Redeploy `tmdb-proxy`, `generate-taste-profile`, `generate-journal`, and apply the new migration.

## Production configuration snapshot

Verified live on 2026-06-13:

- Vercel production env names present for `plot`:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `VITE_TMDB_PROXY_URL`
  - `VITE_PUBLIC_POSTHOG_HOST`
  - `VITE_PUBLIC_POSTHOG_PROJECT_TOKEN`
- Supabase function secrets present for `mkegtssedjyqldysvzga`:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_SECRET_KEYS`
  - `SUPABASE_PUBLISHABLE_KEYS`
  - `SUPABASE_JWKS`
  - `SUPABASE_DB_URL`
  - `TMDB_API_KEY`
  - `PLEX_TOKEN_SECRET`
  - `RESEND_API_KEY`
  - `LINEAR_API_KEY`
  - `LINEAR_FEEDBACK_TEAM_ID`

Production functions expected for launch:

- Public:
  - `marketing-feed`
  - `marketing-veto`
  - `newsletter-subscribe`
  - `calendar-feed`
- Authenticated:
  - `tmdb-proxy`
  - `generate-journal`
  - `generate-taste-profile`
  - `delete-account`
  - `media-sync`
  - `notify-feedback`
  - `trakt-sync`

Launch rule:

- Treat missing production functions as a release blocker even if the code exists in the repo. A missing function should fail the release gate the same way a failing deploy would.
- Direct Plex/Trakt account sync is not part of the first public launch build. The settings surface is launch-gated until the full Trakt client env/secret set is ready in production.

## TMDB compliance decision

Verified against TMDB's official docs on 2026-06-13:

- TMDB's developer API is free for non-commercial use with attribution.
- If the primary purpose of the product is to generate revenue, TMDB treats that as commercial use and requires a commercial arrangement through `sales@themoviedb.org`.
- Required attribution text:
  - `This product uses the TMDB API but is not endorsed or certified by TMDB.`
- TMDB asks for attribution in an `About` or `Credits` style surface and for use of an approved TMDB logo when identifying TMDB API usage.

Launch decision:

- First public launch is treated as a non-commercial product launch unless the launch plan changes to a revenue-primary model.
- If PLOT adds subscriptions, paid access, sponsorship-driven TMDB usage, or another revenue-primary path, contact TMDB sales before shipping that business model.
- The required TMDB notice now exists in the app legal pages, the website legal pages, the marketing/legal docs, and the in-app Settings support section.
- The browser app calls TMDB through `VITE_TMDB_PROXY_URL`; the raw TMDB API key is not exposed in the client bundle.
- Repo guardrail remains in force: never hardcode TMDB IDs; resolve them from TMDB responses at runtime.

## Feedback, support, and privacy handling

Launch support path:

- In-app feedback is the primary launch support intake.
- Feedback is mirrored anonymously into the `PLOT Feedback` Linear project by `notify-feedback`.
- `feedback@theplot.tv` remains the human triage inbox for launch support.

Attachment handling:

- Feedback screenshots upload before the feedback row is inserted.
- If any screenshot upload fails, submission now stops with a specific user-visible error.
- If the feedback insert fails after uploads, the just-uploaded objects are deleted immediately so orphaned public files are not left behind.
- On successful mirror, `notify-feedback` copies attachments into `feedback-attachments/linear-archive/...` so the Linear report survives account deletion.
- Account deletion removes the user's original `feedback-attachments` objects before deleting the auth user.

Operational decision:

- Support triage owner for launch is the PLOT feedback backlog plus the `feedback@theplot.tv` mailbox.
- Screenshot attachments are intentionally retained only for shipped support evidence and the archived Linear copy.

## Monitoring and review cadence

Production analytics/events expected at launch:

- auth start / signup complete
- onboarding complete
- title search
- save to watchlist
- start watching
- mark watched / progress update
- calendar link generated
- feedback sent
- delete account attempt

Monitoring stack:

- Product analytics: PostHog
- App-level crash containment: React `ErrorBoundary`
- Backend health: Supabase function logs
- Frontend error reporting decision for first launch: no extra Sentry-style SDK. Use Vercel deploy health, manual QA, PostHog funnel anomalies, and Supabase/Vercel logs; revisit a dedicated client error sink after launch.

Launch review cadence:

- First 72 hours: review PostHog funnels and Supabase function logs twice daily.
- After day 3: review daily until incident volume is stable.
- Watch these functions first:
  - `tmdb-proxy`
  - `notify-feedback`
  - `media-sync`
  - `trakt-sync`
  - `calendar-feed`
  - `delete-account`
  - `generate-taste-profile`

Alert policy for first launch:

- Any auth failure, calendar failure, feedback failure, or repeated TMDB proxy failure is a same-day incident.
- Any missing function, missing env var, or broken public marketing endpoint blocks release.

## Release gate and beta plan

Initial beta shape:

- Invite-only beta.
- Cohort target: up to 50 users before widening access.
- Feedback source of truth: in-app feedback mirrored to Linear.

Release gate:

- `npm run check`
- `node --test tests/unit/*.test.js`
- `npm run test:smoke` with Playwright Chromium installed
- manual pass from [public-launch-checklist.md](/Users/savannahblack/.codex/worktrees/122d/PLOT/docs/qa/public-launch-checklist.md)
- legal/vendor checks complete:
  - TMDB attribution present
  - commercial-use decision recorded
  - privacy/terms updated
- production config checks complete:
  - required Vercel env names present
  - required Supabase secrets present
  - required functions deployed

Launch blockers:

- missing production function
- broken auth callback or password reset flow
- broken feedback intake
- broken calendar token flow
- repeated external API failure without fallback

## Rollback plan

Web rollback:

- Re-promote the previous healthy Vercel deployment if the latest deploy breaks auth, routing, or core app rendering.
- If needed, revert the offending Git commit and redeploy to restore branch parity.

Edge-function rollback:

- Redeploy the prior known-good function source for the affected function.
- Prioritize rollback for `tmdb-proxy`, `notify-feedback`, `delete-account`, `media-sync`, `trakt-sync`, and `calendar-feed`.

Database rollback:

- Treat Supabase migrations as forward-only unless a rollback migration has been explicitly written and reviewed.
- Before applying launch-critical migrations in production, capture a fresh backup/snapshot.
- If a production migration is bad, prefer either:
  - a corrective follow-up migration, or
  - restoring from the pre-deploy backup if the blast radius is unacceptable.

Launch decision:

- Data export is intentionally out of scope for first public release.
- If a user requests export during beta, respond manually rather than promising an in-product export feature that does not exist.
