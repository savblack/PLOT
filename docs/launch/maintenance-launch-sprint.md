# PLOT Maintenance → Relaunch Sprint

Written 2026-08-10. This is the plan of record for taking PLOT dark to the public,
finishing the mobile app, and relaunching web + iOS + pricing together.

Decisions already made by Savannah on 2026-08-10 are recorded inline as **Decision**.

## The shape of it

PLOT goes into public maintenance now. Existing accounts keep working. Everything
that isn't ready gets finished behind that curtain, and web, iOS, pricing and the
marketing flow all go live on the same day.

Sprint 0 ships in a day or two. Full relaunch is **7 to 9 weeks** from that point.

## Standing decisions

- **Existing accounts are grandfathered.** New signups are blocked; people who
  already have an account can still sign in and use PLOT. See "Reconciling the
  maintenance page with grandfathering" below for exactly what each visitor sees.
- **Apple Developer Program is already paid and enrolled** (confirmed 2026-08-10).
  This unblocks Sign in with Apple, APNs push, and TestFlight immediately. The
  "no Apple Developer Program" comments in `apps/web/src/launchFeatures.js` and
  `apps/mobile/lib/launchFeatures.ts` are now stale and should be corrected.
- **Premium is sold on the web only at launch.** No native IAP, no RevenueCat,
  no Apple cut. The existing Stripe Checkout is the single purchase path.
- **Brevo owns marketing, Resend owns transactional.** Waitlist, newsletter,
  lifecycle automation and campaigns in Brevo. Supabase auth email, feedback and
  notification email stay on Resend.

## Reconciling the maintenance page with grandfathering

"Block logging in" and "grandfather existing accounts" pull in opposite
directions, so the resolution is:

| Visitor | Sees |
| --- | --- |
| Logged out, arrives at `/`, `/signup`, or any app route | Maintenance splash + waitlist form |
| Logged out, clicks "Already have an account? Sign in" on the splash | The real login form |
| Existing account, signed in | The app, unchanged |
| Anyone attempting to create an account | Blocked, in the UI *and* at Supabase |
| Preview deployment | Everything, unchanged (your test bed) |

The public face is unambiguously "PLOT is under maintenance". Signup is closed
for real, not just hidden. Current users are never locked out of their own data.

Blocking signups in the client alone is not enough — the Supabase anon key is
public and `auth.signUp()` can be called directly. Sprint 0 therefore turns off
"Allow new users to sign up" in the Supabase Auth dashboard as well, and gates
the `signup-bypass` edge function.

## Sprint 0 — Go dark (1 to 2 days)

Ships first and independently. Everything after this happens behind the curtain.

1. **`MAINTENANCE_MODE` flag** in `apps/web/src/launchFeatures.js`, driven by
   `VITE_MAINTENANCE_MODE` so it flips via a Cloudflare Pages variable + redeploy,
   mirrored into `apps/mobile/lib/launchFeatures.ts` per the existing convention.
2. **Maintenance splash** (`apps/web/src/pages/MaintenancePage.jsx`): Instrument
   Serif wordmark, flat monochrome, hairline structure, no gradients or glows.
   Copy: PLOT is under maintenance, bigger and better things are coming. Email
   capture, plus the discreet "Already have an account? Sign in" affordance.
   Strings go in `packages/core/copy` like everything else.
3. **Router gating** in `apps/web/src/router.jsx`: `/`, `/signup`, `/save`,
   `/u/:username` and all protected routes render the splash when logged out.
   `/login`, `/terms`, `/privacy` and `/reset-password` stay reachable.
   `isPreviewDeployment()` exempts preview deploys, as it already does today.
4. **Email capture wired to the waitlist that already exists**: POST to
   `newsletter-subscribe` with `list: 'mobile-app'`, landing in `app_waitlist`.
   No new table, no new function.
5. **Close the Brevo gap**: the `app_waitlist` branch of `newsletter-subscribe`
   currently skips the Brevo sync that the newsletter branch does. Add it, into a
   dedicated Brevo "PLOT Waitlist" list, so Sprint 6's automations have an
   audience to address.
6. **Analytics**: a waitlist-signup event in `packages/core/analyticsEvents.js`,
   fired from both the app splash and the website form, so the waitlist is a
   measurable funnel rather than a table nobody looks at.
7. **Website (`theplot.tv`)**: primary CTA becomes the waitlist instead of
   "Get started". `plans.html` stays hidden (`SHOW_PRICING_PAGE` is already off).
8. **Ops**: Supabase Auth → disable new signups. Gate `signup-bypass`.
9. **Email current users once**, from Resend: what's happening, that their data is
   safe, that their account still works, and when to expect the relaunch.

## Sprint 1 — Ops long-leads (starts day 1, runs in parallel)

No longer blocking, since Apple is enrolled. Do these early anyway.

- App Store Connect: create the app record for `tv.theplot.app`, agreements,
  banking and tax. Nothing can be submitted until the agreements are signed.
- APNs key + Sign in with Apple service ID and key (both needed in Sprint 3/5).
- Stripe live mode: follow `docs/billing/stripe-launch.md` end to end.
- Brevo: account, lists, sender authentication for `theplot.tv`.

## Sprint 2 — Mobile to launch quality (3 to 4 weeks)

The mobile app is the priority product; web is deliberately second class. Mobile
today is 8 screens against web's much larger surface. Closing the gap that matters:

- **Statistics v1** — the one genuinely absent capability versus Cinephile. All
  derivable from existing `history` data, no schema change. Core module + both apps.
- **Status model** — add Paused, make Watching work for movies. Needs a
  `watching_progress.media_type` column first.
- **Discover completion** — mobile renders only `feed`/`discover`/`guide`
  (`apps/mobile/app/(app)/index.tsx:613`). New Releases genre rails and Upcoming
  are missing, and Upcoming needs a net-new hook.
- **Letterboxd import on mobile** — web has `ImportView`, mobile has nothing.
- **Talent/person pages on mobile** — web has `TalentPage`, mobile has nothing.
- **Mobile QA pass** — the launch-blocking bug sweep, matching what
  `docs/qa/public-launch-checklist.md` does for web.

Deliberately **not** in this sprint: rewatch tracking (reverted after a two-week
production outage, see the parity program notes), social feed (needs a safety and
moderation review before it can be flipped on), native IAP, Statistics v2.

## Sprint 3 — Notification system (1.5 to 2 weeks)

Today "notifications" means social events only, web only, in `apps/web/src/hooks/`
rather than core, with no preferences and no delivery channel other than the
in-app bell.

1. **Define the event taxonomy** — one list of every notifiable event (follow,
   follow request, request accepted, like, comment, watchlist availability,
   release reminder, billing, onboarding milestones) with, per event, its
   in-app / email / push routing and its default.
2. **Hoist to core** — `useNotifications` moves to `packages/core`, both apps read it.
3. **Mobile notification centre** — the screen mobile has never had.
4. **Preferences surface** — per-channel, per-category, on both apps, honoured
   server-side rather than only hidden in the UI.
5. **Email channel via Resend**, driven off the same taxonomy.
6. **Push via APNs** — add `expo-notifications` (not currently a dependency),
   token registration, deep links into the notification centre. Sequenced after
   the centre exists so a tapped push has somewhere to land.
7. **Turn on watchlist availability alerts** — built, flag-off, and the cron has
   never actually been exercised. Dry-run via `workflow_dispatch` before enabling
   the schedule; it shares a failure mode with the `for-you-recompute` job that
   silently failed 100% of the time.

## Sprint 4 — Payments (3 to 5 days)

Short, because the build already exists and was verified end to end on 2026-08-09
before being hidden.

- Complete `docs/billing/stripe-launch.md` in live mode.
- Flip `SHOW_PRICING_PAGE` on web, mobile and the website Pages variable.
- **Manually re-add `/plans.html`** to `apps/website/llms.txt` and
  `apps/website/sitemap.xml` — those entries were deleted outright, not gated, and
  will not come back with the flag.
- Re-verify the premium-intent onboarding path (`?intent=premium&plan=...`) now
  that its gate is lifted.
- One real low-value purchase, cancellation, and confirmed loss of access.
- iOS shows Premium as a web upgrade, with no in-app purchase surface.

## Sprint 5 — App Store submission (1 week prep, then 1 to 2 review cycles)

- Screenshots for every required device size, app preview, description, keywords.
- App Privacy nutrition labels, mapped honestly against PostHog, Supabase, TMDB,
  Stripe and Brevo.
- **Sign in with Apple is mandatory** if any third-party sign-in ships on iOS.
  Flip `SHOW_APPLE_LOGIN` and implement, or ship email-only on iOS.
- Account deletion is already implemented (`delete-account`), which Apple requires.
- Age rating, content rights (the TMDB attribution decision is already recorded),
  support and marketing URLs.
- TestFlight internal build, then external, then submit.
- Budget for one rejection. First submissions usually get one.

## Sprint 6 — Brevo marketing flow (1 week, overlaps Sprint 5)

- Waitlist welcome, a short nurture sequence, and the relaunch announcement.
- Segmentation: waitlist vs newsletter vs existing users vs Premium.
- Wire the existing `marketing/` automation and the admin desk into Brevo where
  it makes sense, rather than building a second system beside it.
- Suppression and unsubscribe handling shared with `marketing_subscribers`.

## Timeline

| Sprint | Duration | Notes |
| --- | --- | --- |
| 0 — Go dark | 1 to 2 days | Ships immediately, independent |
| 1 — Ops long-leads | days, parallel | Apple already enrolled |
| 2 — Mobile quality | 3 to 4 weeks | The critical path |
| 3 — Notifications | 1.5 to 2 weeks | Partially parallel with 2 |
| 4 — Payments | 3 to 5 days | Mostly dashboard work |
| 5 — App Store | 1 week + review | Review is 24 to 48h per cycle |
| 6 — Marketing | 1 week | Overlaps 5 |

**Maintenance page live: 1 to 2 days. Full relaunch: 7 to 9 weeks.**

The estimate assumes mobile stays the priority and web absorbs whatever falls out
of core for free. The two things most likely to move it: the mobile QA pass finding
more than a sprint's worth of problems, and App Store review cycles.

## Risks

- **Migrations merged to `main` apply to production immediately.** Sprint 2's
  `watching_progress.media_type` column is the only schema change planned; write it
  as if it runs the moment it merges.
- **Grandfathered users are on live production the whole time.** Every change in
  Sprints 2 to 4 has to stay safe for them. This is the cost of not blocking
  everyone, and it is worth restating before each merge.
- **Parallel sessions share this checkout.** Never `git add -A`; re-verify deletions
  against current `main` immediately before merging.
- **The waitlist is only as good as its Brevo sync.** If step 5 of Sprint 0 slips,
  emails accumulate in a table with no way to reach them.
