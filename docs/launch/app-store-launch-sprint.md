# PLOT Maintenance → Relaunch Sprint

Written 2026-08-10, revised the same day after a full decision review.
This is the plan of record for taking PLOT dark to the public, finishing the iOS
app, and relaunching web + iOS + pricing together.

## The shape of it

PLOT goes dark to the public now. All 20 existing users are blocked and emailed.
Everything unfinished gets built behind that curtain, and web, iOS and pricing all
go live on one day of your choosing.

**6 to 8 weeks.** There is no go-dark sprint and no payments sprint; PLOT is live now and
launches free.

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
| 7 | **No social feed at all.** Profiles are the social surface; **report + block ship**; Fable-style **share cards** are the growth loop. Revised 2026-08-10, see below. |
| 8 | **In-app + email + push**, with push scoped to watchlist availability alerts only. |
| 9 | **Approve then hold**: get App Store approval, sit on it, release on your date. |
| 10 | iOS auth is **email + Sign in with Apple + Google**. |
| 11 | **Statistics ships entirely free. Premium is cut from this cycle** (2026-08-13); prices reset to A$5/mo, A$40/yr for whenever it does ship. |
| 12 | **Web inherits core work for free** and gets no dedicated sprint. |
| 13 | **6 to 8 weeks**, with the cut list agreed in advance. Revised from 5 to 7 by the social rethink. |

### Why no grandfathering

The live user base is small, and the watch activity recorded across its lifetime
is lighter still. Grandfathering would have bought very little and cost a standing
"every merge must be safe for live traffic" constraint across the entire build.
Blocking everyone removes that constraint, removes the sign-in escape hatch from
the splash, and turns the existing users into warm launch advocates instead of
people watching you rebuild underneath them.

Every existing user gets a personal email: what is happening, that their data is safe,
how to export or delete it, and an offer of first access plus one month of free
Premium at relaunch.

### Why not "under maintenance"

"Maintenance" implies unplanned breakage and ages badly. Week six of "under
maintenance" reads as abandoned. It also converts worse than anticipation, and
anyone who lands on it, including an App Store reviewer, reads a product in
trouble rather than one being invested in.

### Why there is no feed (revised 2026-08-10)

The original decision was that the feed stays off behind its flag. That has been
superseded: PLOT is not getting a Twitter-shaped feed at all. The social surface is
**profiles**, closer to Goodreads, and the engagement layer is deleted rather than
dormant.

The reason it is a deletion and not a flag is that it was provably never used.
`post_likes` and `post_comments` both hold **0 rows** on production, so removing
them destroys nothing, and this is the safest moment it will ever be. Half-removal
is how PLOT has twice ended up doing dead-code cleanups, one of which accidentally
deleted the live checkout page.

What stays is the substrate. `feed_posts` is populated by three database triggers
from real actions: watched, favourited, added to a top list. That is structurally
the same activity model Goodreads uses. Keeping it recording while unsurfaced means
a Goodreads-style activity stream stays possible later without starting from an
empty history. It is not surfaced at launch because the current user base and the
activity it has generated would render an empty room, and an empty social surface
is worse than none.

**Report and block still ship**, and are now scoped to what actually exists.
Guideline 1.2 applies to PLOT regardless of the feed: the guideline reads
"user-generated content **or** social networking services" and never mentions a
feed, so avatars, usernames and bios clear the threshold on their own (see
`docs/research/app-store-guideline-1-2.md`). Dropping comments shrinks the surface
to profile fields and the profile social links that same research flagged as an
unconstrained distribution channel.

### Sharing is the growth loop instead

Replacing the feed with something that actually acquires users: Fable-style
shareable graphics, 1080x1920, for Instagram Stories and equivalents.

**At launch: two artifacts.** Your Top 10, and just-watched-or-rated-a-title. Those
cover identity and frequency, which is what a share loop needs. The Statistics /
year-in-review card and the custom-list card are held for the first post-launch
update. The Statistics card is deliberately last: against 13 history rows it renders
empty for almost everyone, so it is a bet on the import flow rather than a
sure thing.

Two render paths, expressed from one template so they cannot drift: server-side via
the existing `apps/web/workers/og/` Worker for web and link previews, and on-device
for the mobile share sheet, because a local render into the native sheet beats a
server round-trip and is what makes sharing feel instant.

Net effect on the estimate is about **plus one week**, taking the plan to 6 to 8.
Deleting the engagement layer and shrinking report/block and the notification
taxonomy pays for part of the sharing work, but not all of it.

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

## Sprint 2b — Remove the feed, then report + block (3 to 4 days)

First delete the engagement layer (#499): the feed UI, `useFeed`, `usePostEngagement`,
the `feed` Discover tab, `SHOW_SOCIAL_FEED`, and the `post_likes` / `post_comments`
tables with their notification triggers. Both tables are empty, so this destroys no
data, but it is still a drop against production with no staging gate: snapshot first
and run `npm run db:write-paths` green before merge.

Then reporting and user blocking, scoped to what remains: profile fields, avatars,
usernames, and the profile social links flagged by the Guideline 1.2 research.

## Sprint 2c — Share cards (about 1 week)

Design and build the Top 10 and just-watched artifacts (#501, #502). Two render
paths from one template: the existing OG Worker for web and link previews, on-device
for the mobile share sheet.

Cache aggressively. On-the-fly Satori rendering was the heaviest CPU consumer in the
app and once exhausted the Vercel Hobby caps, pausing production. Cloudflare's free
tier is far more generous, but the lesson stands.

## Sprint 3 — Notifications (1 to 1.5 weeks)

1. **Event taxonomy** written down first: every notifiable event, its in-app /
   email / push routing, and its default. Shorter than originally scoped, since
   deleting the engagement layer removes post likes and comments outright rather
   than leaving them dormant. Four events remain: follow request received, follow
   request accepted, new follower, watchlist availability alert.
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

## Sprint 4 — Payments: CUT from this cycle (2026-08-13)

**PLOT launches free. Premium does not ship.**

TMDB confirmed that monetising requires a paid commercial licence — self-serve and
month to month below an annual-revenue threshold, with an enterprise tier above it.
Attribution is required but "does not have to be obtrusive", which the Credits
surface already satisfies.

At PLOT's current size no price covers that licence: even full conversion of the
existing user base would not meet the monthly cost. That cost is fixed rather than
scaling — Supabase's free tier runs to 50,000 monthly active users and PLOT's
database is a rounding error against it, and Cloudflare, Resend, Brevo, OMDb and
PostHog all sit comfortably inside free tiers. The TMDB licence is nearly the
entire bill.

**Prices are reset now, so the paywall is designed around a number that works:
A$5/month or A$40/year**, up from the original A$3 and A$25. That roughly halves
the number of subscribers needed to break even. For context, Letterboxd Pro is
US$19/year, Patron US$49, Trakt VIP US$60. At A$25/year PLOT was priced below
Letterboxd Pro while carrying a fixed cost Letterboxd amortises across millions
of users.

`SHOW_PRICING_PAGE` stays off. When Premium does ship:

- Complete `docs/billing/stripe-launch.md` in live mode at the new prices.
- Flip `SHOW_PRICING_PAGE` on web, mobile and the website Pages variable.
- **Manually re-add `/plans.html`** to `apps/website/llms.txt` and
  `apps/website/sitemap.xml`. Those entries were deleted outright, not gated, and
  will not return with the flag.
- Take the TMDB contract first.
- iOS shows Premium as a web upgrade. No in-app purchase surface.

**Still open:** whether the existing Ko-fi tipping, live since 2026-08-02, already
counts as revenue under "this includes all revenue". If it does, the contract is
owed regardless of Premium. Awaiting TMDB's answer (#519).

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
| 2b — Remove feed, then report + block | 3 to 4 days |
| 2c — Share cards | ~1 week |
| 3 — Notifications | 1 to 1.5 weeks |
| 4 — Payments | **cut** |
| 5 — App Store | 3 to 5 days + review |
| 6 — Brevo | 3 to 5 days, overlaps |

**6 to 8 weeks.** Roughly five of those are work; the rest is Apple and reality.

Cutting the payments sprint saves two or three days, which is inside the noise of a
six-to-eight-week range, so the headline does not move.

Revised up from 5 to 7 by the social rethink. Deleting the engagement layer and
shrinking report/block and the notification taxonomy saves perhaps half a week, and
holding two of the four share artifacts saves more, but Sprint 2c still adds about a
week net. Calling that neutral would have been wishful.

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
