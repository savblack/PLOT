# PLOT Maintenance → Relaunch Sprint

Written 2026-08-10, revised the same day after a full decision review.
This is the plan of record for taking PLOT dark to the public, finishing the iOS
app, and relaunching web + iOS + pricing together.

## The shape of it

PLOT goes dark to the public now. All 20 existing users are blocked and emailed.
Everything unfinished gets built behind that curtain, and web, iOS and pricing all
go live on one day of your choosing.

Sprint 0 ships in about two days. Full relaunch is **5 to 7 weeks** from then.

## Decisions

Every one of these was decided deliberately on 2026-08-10. Where a decision
overturns an earlier assumption, the reasoning is kept so it is not silently
re-litigated later.

| # | Decision |
| --- | --- |
| 1 | **No grandfathering.** Every account is blocked, not just new signups. |
| 2 | Positioning is **"something bigger is coming"**, not "under maintenance". |
| 3 | The **marketing surface stays fully live**, with every CTA retargeted to the waitlist. |
| 4 | **Data rights move to email**, and the privacy policy is amended to say so. |
| 5 | **iOS only** at launch. Android comes after. |
| 6 | **All four mobile items ship**: Statistics v1, New Releases + Upcoming, the Paused/Watching status model, Talent pages. |
| 7 | The **social feed stays off**, but **report + block ship**. |
| 8 | **In-app + email + push**, with push scoped to watchlist availability alerts only. |
| 9 | **Approve then hold**: get App Store approval, sit on it, release on your date. |
| 10 | iOS auth is **email + Sign in with Apple + Google**. |
| 11 | **Basic Statistics free, deeper Statistics Premium.** |
| 12 | **Web inherits core work for free** and gets no dedicated sprint. |
| 13 | **5 to 7 weeks**, with the cut list agreed in advance. |

### Why no grandfathering

Production has 20 users, 6 of whom signed in during the last week, who have
between them marked 13 titles as watched in the product's lifetime. Grandfathering
would have bought very little and cost a standing "every merge must be safe for
live traffic" constraint across the entire build. Blocking everyone removes that
constraint, removes the sign-in escape hatch from the splash, and turns 20 users
into 20 warm launch advocates instead of 20 people watching you rebuild underneath
them.

Each of the 20 gets a personal email: what is happening, that their data is safe,
how to export or delete it, and an offer of first access plus one month of free
Premium at relaunch.

### Why not "under maintenance"

"Maintenance" implies unplanned breakage and ages badly. Week six of "under
maintenance" reads as abandoned. It also converts worse than anticipation, and
anyone who lands on it, including an App Store reviewer, reads a product in
trouble rather than one being invested in.

### Why the feed stays off

There is no reporting, blocking, or moderation anywhere in the codebase. App Store
Guideline 1.2 requires content filtering, a report mechanism, user blocking, and
published contact info for apps with user-generated content. The feed broadcasts
review text to followers, which is squarely in scope. Shipping report + block
anyway covers the avatars, usernames and follow graph that already exist on
mobile, removes the likeliest rejection reason, and is a prerequisite for the feed
whenever it does ship.

## Sprint 0 — Go dark (about 2 days)

1. **`MAINTENANCE_MODE` flag** in `apps/web/src/launchFeatures.js`, driven by
   `VITE_MAINTENANCE_MODE` as a Cloudflare Pages variable, mirrored into
   `apps/mobile/lib/launchFeatures.ts` per the existing convention.
2. **The splash** (`apps/web/src/pages/MaintenancePage.jsx`): Instrument Serif
   wordmark, flat monochrome, hairline structure, no gradients or glows.
   "Something bigger is coming", not an apology. Email capture. No sign-in link.
   Strings go in `packages/core/copy`.
3. **Router gating**: `/`, `/login`, `/signup`, `/save`, `/u/:username` and every
   protected route render the splash. `/terms` and `/privacy` stay reachable.
   `isPreviewDeployment()` exempts preview deploys, which stay fully functional as
   the test bed.
4. **Public profiles are gated too**, and pulled from `sitemap-profiles.xml`. Nobody
   should have an indexed profile they cannot log in to edit or remove.
5. **Email capture** posts to `newsletter-subscribe` with `list: 'mobile-app'` and
   `source: 'maintenance'`. Already built and verified end to end (PR #472).
6. **Analytics**: a waitlist-signup event in `packages/core/analyticsEvents.js`,
   fired from both the splash and the website.
7. **Website**: all 7 signup/login CTAs become waitlist CTAs. The site itself,
   `/movie`, `/whats-on`, articles and sitemaps all stay live.
8. **The publishing machine keeps running.** `marketing-publish.yml` posts daily and
   `marketing-weekly-batch.yml` runs Sundays. The copy convention in
   `marketing/copy/AGENT.md` must be retargeted from "start your PLOT" to the
   waitlist, or nine weeks of daily posts drive traffic into a wall.
9. **Ops**: disable signups in the Supabase Auth dashboard (the anon key is public,
   so `auth.signUp()` is callable directly and a client gate alone is not a block).
   Gate the `signup-bypass` edge function.
10. **Privacy policy amended** — it currently promises deletion "at any time through
    the account settings screen", which a blanket block breaks.
11. **Email the 20**, from Resend.

## Sprint 1 — Ops long-leads (parallel, from day 1)

- App Store Connect: app record for `tv.theplot.app`, agreements, banking, tax.
  Nothing can be submitted until the agreements are signed.
- APNs key; Sign in with Apple service ID + key; Google Cloud OAuth client.
- Stripe live mode per `docs/billing/stripe-launch.md`.
- Brevo: sender authentication for `theplot.tv`, plus the waitlist automation.

## Sprint 2 — Mobile to launch quality (1.5 to 2 weeks)

Smaller than first estimated: mobile already has Letterboxd/Netflix/CSV import
(`ImportHistoryModal.tsx`) and watched-date editing (#468).

- **Statistics v1** — absent from both apps, and the Cinephile parity bar. Core
  module, both apps render. Basic tier free.
- **Discover: New Releases + Upcoming** — mobile renders 3 of 5 tabs
  (`apps/mobile/app/(app)/index.tsx:613`). Missing tabs read as an unfinished app.
- **Status model** — Paused, and Watching for movies. Needs a
  `watching_progress.media_type` column.
- **Talent/person pages** on mobile.
- **Import gets promoted in onboarding.** With 13 history rows in production,
  Statistics renders an empty screen until people import. Whatever drives import
  matters more than the stats themselves.

## Sprint 2b — Report + block (2 to 3 days)

Reporting and user blocking for the profile and follow surface. Not the feed.

## Sprint 3 — Notifications (1 to 1.5 weeks)

1. **Event taxonomy** written down first: every notifiable event, its in-app /
   email / push routing, and its default.
2. **Hoist `useNotifications` to `packages/core`** from `apps/web/src/hooks/`.
3. **Mobile notification centre** — mobile has never had one.
4. **Preferences**, per channel and category, enforced server-side.
5. **Email channel** via Resend.
6. **Push via APNs**, scoped to availability alerts. Needs `expo-notifications`
   (not currently a dependency), token registration, permission UX, deep links.
7. **Turn on watchlist availability alerts.** The cron in
   `.github/workflows/watchlist-availability-alerts.yml` is commented out and has
   never run. Dry-run via `workflow_dispatch` before enabling the schedule; it
   shares a failure mode with `for-you-recompute`, which once failed silently 100%
   of the time.

## Sprint 4 — Payments (2 to 3 days)

- Complete `docs/billing/stripe-launch.md` in live mode.
- Flip `SHOW_PRICING_PAGE` on web, mobile and the website Pages variable.
- **Manually re-add `/plans.html`** to `apps/website/llms.txt` and
  `apps/website/sitemap.xml`. Those entries were deleted outright, not gated, and
  will not return with the flag.
- Split Statistics: basic free, deeper Premium. Scope the Premium tier to metrics
  derivable from `history` directly (genre breakdown, ratings distribution,
  year-over-year). Watch-time and top-people need a nightly enrichment job and are
  v2.
- iOS shows Premium as a web upgrade. No in-app purchase surface.

## Sprint 5 — App Store (3 to 5 days, then review)

- Screenshots for every required device size, description, keywords.
- App Privacy labels mapped honestly against PostHog, Supabase, TMDB, Stripe, Brevo.
- Sign in with Apple and Google. Google makes Sign in with Apple mandatory under
  Guideline 4.8.
- Account deletion already exists (`delete-account`), which Apple requires.
- TestFlight internal, then external, then submit.
- **Hold at "Approved, Pending Developer Release"** until launch day.

## Sprint 6 — Brevo marketing flow (3 to 5 days, overlaps Sprint 5)

- Waitlist welcome, a short nurture sequence, the relaunch announcement.
- Segmentation: waitlist (`WAITLIST_SOURCE`) vs newsletter vs the original 20.
- Suppression and unsubscribe shared with `marketing_subscribers`.

## Timeline

| Sprint | Duration |
| --- | --- |
| 0 — Go dark | ~2 days |
| 1 — Ops long-leads | parallel |
| 2 — Mobile | 1.5 to 2 weeks |
| 2b — Report + block | 2 to 3 days |
| 3 — Notifications | 1 to 1.5 weeks |
| 4 — Payments | 2 to 3 days |
| 5 — App Store | 3 to 5 days + review |
| 6 — Brevo | 3 to 5 days, overlaps |

**5 to 7 weeks.** Roughly four of those are work; the rest is Apple and reality.

The estimate is grounded in observed throughput (438 commits and 54 merges to
`main` in the last 30 days, 40 PRs merged in the last 14). What does *not* compress
with that throughput: App Store review cycles at 24 to 48 hours each with a likely
first rejection, real-device testing on an app no real user has ever run on real
hardware, APNs and Sign in with Apple certificate setup, and review time between
sprints.

## Cut list, agreed in advance

If week four is behind, drop in this order. Each ships in the first post-launch
update without the launch feeling unfinished.

1. Talent/person pages
2. The Paused/Watching status model (the only schema change, and rushing schema is
   exactly how this project lost two weeks in July)
3. Google sign-in (Sign in with Apple alone covers iOS)
4. Push notifications

## Implementation notes for the risky parts

- **The one-month Premium grant** does not need a schema change or a card. `is_premium()`
  is self-expiring: it reads `billing_customers.subscription_status` and
  `current_period_end`, and a trigger forbids writing `profiles.is_premium` directly.
  A `billing_customers` row with `subscription_status = 'trialing'` and
  `current_period_end = now() + 30 days` grants entitlement and lapses on its own.
- **The `watching_progress.media_type` migration** merges straight to production with
  no staging gate. Write it purely additive, capture a backup snapshot first, and
  require `npm run db:write-paths` green before merge.
- **`create or replace function`** replaces the whole body and Postgres accepts a
  stale one silently. This cost two weeks of failed `history` writes in July. Diff
  against the live definition, never against the migration you remember.

## Risks

- **The waitlist is currently one address.** The website's "notify me" form has been
  live for some time and has collected a single signup. The splash is a far more
  prominent capture point, but do not assume an audience exists yet.
- **Statistics will look empty** until people import. See Sprint 2.
- **Parallel sessions share this checkout.** Never `git add -A`; re-verify deletions
  against current `main` immediately before merging.
- **Nine weeks of daily posts pointing at a wall** if step 8 of Sprint 0 slips.
