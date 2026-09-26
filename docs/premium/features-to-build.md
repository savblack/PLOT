# PLOT Premium: features to build (agent handoff)

**Audience:** another agent picking up Premium product work.  
**Status of this doc:** locked Free/Premium *positioning* as of 2026-09-23; build status updated 2026-09-26. **Pick for Me** (the tonight picker) is live on `main`; Watch together is in review; most other Premium *product* features are not built yet. Checkout is hard-closed.  
**Canonical entitlement copy:** `packages/core/copy/plansPage.js` (never invent a second matrix).  
**Prior decision thread:** [Premium upgrade journey](9766f334-4f25-4949-891a-ee18a19d4991).  
**Research:** `docs/research/premium-positioning-2026-09-16.md`, `docs/research/premium-preview-merge-notes.md`.

---

## 0. Read this first

1. **Do not open Checkout until Plex + Trakt sync works for a real Premium user.** That is Savannah’s hard ship gate. See Phase A below and Linear [PLO-492](https://linear.app/savblack/issue/PLO-492).
2. **Entitlement authority is the database**, not the client. `public.is_premium()` + edge-function `premium_required` / RLS. Client helpers in `packages/core/premium.js` are UX pre-checks only.
3. **Never claim playback or synced watching in Plot.** Shared watch sessions help people *choose* a title; they watch on their streaming service.
4. **Never promise personally tailored recommendations yet.** Free has “More like this” on a title page only. Tailored recs wait until Premium revenue can fund them.
5. **iOS / mobile does not sell Premium in-app.** Web upgrade only. Mobile `SHOW_PRICING_PAGE = false`; no StoreKit / IAP surface. See `docs/launch/app-store-launch-sprint.md`.
6. **Ko-fi tips ≠ Premium.** `is_supporter` is recognition only. Do not wire tips into `is_premium()`.
7. **Pricing decided:** **US$3/month or US$24/year**, USD primary, converted to local currency at checkout. `plansPage.js` on `main` already says $3/$24. See §2 for the Stripe mechanism still to confirm.
8. **Plex + Trakt stay hidden (2026-09-24).** `SHOW_MEDIA_SYNC_INTEGRATIONS` stays `false` on both platforms. Production has `PLEX_TOKEN_SECRET` / `TRAKT_TOKEN_SECRET` but **no `TRAKT_CLIENT_ID` / `TRAKT_CLIENT_SECRET`**, and no Trakt OAuth app is set up. Work on other Premium features meanwhile. A mobile Premium gate for the sync rows is ready on local branch `agent/plo-492-media-sync` (not pushed).

---

## 1. Current state (what already exists)

| Area | State |
| --- | --- |
| `/plans` preview page | Live on web (`SHOW_PRICING_PAGE = true`). Says Premium is coming soon; no payment. |
| Upgrade journey | Feature prompt → Explore Premium → `/plans?from=` → coming-soon message. See `apps/web/src/utils/premiumExplore.js`. |
| Stripe plumbing | `stripe-billing`, `stripe-webhook`, `billing_customers`, `is_premium()`, portal + tip paths exist. |
| Checkout | **Hard-closed:** `usePremium.startCheckout` stubs; `stripe-billing` returns 503 `premium_coming_soon` for `action=checkout`. |
| Free list cap | Free: 5 custom lists (`FREE_CUSTOM_LIST_CAP`). Premium: unlimited via `can_create_custom_list()`. Enforced in DB. Sixth-list UX → Explore Premium. |
| Live calendar feed | Backend `calendar-feed` + token exist. UI Premium-gates subscribe; free users get one-time `.ics` snapshot. |
| Plex / Trakt sync | Edge functions implement sync and return `premium_required` for non-Premium. **UI flag off:** `SHOW_MEDIA_SYNC_INTEGRATIONS = false` (web + mobile). Premium users still see “coming soon”. |
| Marketing homepage previews | Illustrative Tonight / Together / Following storyboards only. Not live product. |
| Pick for Me (tonight picker) | **Live on `main`** (PR #1029, merged 2026-09-25). See §5.2. |
| Watch together (overlap + shared lists) | **In review:** PR #1039 (`agent/watch-together`, web, phases 1 to 3). Decisions in `docs/design/watch-together/README.md` on `agent/watch-together-design`. |
| `/plans` rebuild | **In review:** PR #1031 (`agent/premium-plans-a2`), side-by-side plans at US$3/$24. |
| One-off Plex / Trakt / IMDb history imports | Merged (PRs #1035, #1037). Manual imports stay Free; *automatic* sync is still the Premium item. |
| Stats, smart lists, people alerts, season-ready, customise | **Not built** as product features (copy only). |

---

## 2. Pricing (resolve before charging)

**Decided (Savannah, 2026-09-24/25):** **US$3/month or US$24/year.** The earlier A$5/A$40 plans copy and the US$25/year figure are both superseded. `packages/core/copy/plansPage.js` on `main` already shows `$3/month or $24/year`; Settings (web + mobile) and the Pick for Me upgrade pop-up read that one string (`PLANS_PAGE.premium.priceSummary`). Nothing in the app fetches prices from Stripe, so everyone sees `$`, whatever their country.

USD is primary; buyers outside the US see it converted at checkout. The intended Stripe mechanism is **Adaptive Pricing** on Checkout (one USD price; Stripe shows and charges local currency, buyer pays the FX margin). The alternative is fixed per-currency `currency_options` (round local prices, manual upkeep). **Still to confirm:** that Adaptive Pricing covers subscriptions on this account. Showing a real local price *inside* the app would need a small endpoint reading the price and its currency options from Stripe; not built.

**Agent action:** when Checkout opens, point Supabase secrets `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` at the live US$3 / US$24 prices, update `docs/billing/stripe-launch.md`, and drop the "Pricing is tentative" line from `plansPage.js` (`premium.availability`). PR #1031 is rebuilding `/plans` with this pricing, so coordinate with it.

Never put Stripe secret keys or price IDs in browser vars or tracked files.

--- | --- |
| Locked plans copy + `docs/billing/stripe-launch.md` | **A$5/month or A$40/year** (marked tentative but likely in Sep 21 decisions) |
| Linear [PLO-494](https://linear.app/savblack/issue/PLO-494) (first-paid track, 2026-09-23) | **USD $3/month + USD $25/year** live Stripe prices; notes AUD prices on product inactive |

**Decision (Savannah, 2026-09-24):** USD is the primary price (PLO-494: USD $3/month, $25/year). Buyers outside the US see it converted to their currency. The intended Stripe mechanism is **Adaptive Pricing** on Checkout (one USD price; Stripe shows and charges local currency at checkout, and the buyer pays the FX margin). The alternative is fixed per-currency `currency_options` on the price, which gives round local prices but needs manual upkeep. Confirm in the Stripe Dashboard that Adaptive Pricing covers subscriptions on this account before relying on it. Plans copy should show USD with a note that checkout shows local currency.

**Agent action:** once Savannah confirms the Stripe mechanism, update `packages/core/copy/plansPage.js`, Settings copy, `docs/billing/stripe-launch.md`, and Supabase secrets `STRIPE_PRICE_MONTHLY` / `STRIPE_PRICE_YEARLY` together.

Never put Stripe secret keys or price IDs in browser vars or tracked files.

---

## 3. Locked Free vs Premium matrix

Source of truth: `packages/core/copy/plansPage.js` (decisions locked in the Premium upgrade journey chat, Sep 21–23 2026).

### Free today

- Movie and TV tracking, watch history, episode progress
- Watchlist, ratings, reviews
- Private watchlist notes
- Up to **five** custom lists
- Discovery, search, where to watch, **More like this** (not tailored recs)
- Viewing statistics: **Limited** (whatever is in the app today stays free)
- In-app release calendar + **one-time** calendar `.ics` download
- Follow friends / share profiles
- Manual imports and data exports

### Free, planned (not Premium)

- **Movie and episode release notifications** (moved Free deliberately; do not put behind paywall)
- **Join** a Premium host’s collaborative lists and shared watch sessions (host needs Premium; joiners stay Free)

### Premium, planned (build these)

Lead stories (positioning priority, not a statistical ranking):

1. **Pick for Me**, the tonight picker (movie or show, time, services → shortlist / Surprise me). **Built.**
2. Watchlist overlap / “something you both want”
3. Create / host collaborative lists
4. Automatic Plex and Trakt syncing
5. Deeper viewing stats
6. Unlimited custom lists + smart lists
7. Live calendar subscription
8. Actor / director release alerts
9. Whole-season-ready alerts (verified episode availability on selected services/region)
10. Customise your plot (widgets, custom icons, custom profile pages, themes)

### Pending validation (do not market as ready)

- **Leaving-my-service-soon alerts.** Not reliably detectable with current TMDB / JustWatch partner data (no usable flatrate end dates in what we map). Heuristic “offer vanished” is noisy. Only revisit after confirming partner `available_to` (or equivalent) coverage for AU flatrate.

### Explicitly not claimed

- Playback or synced watching inside Plot
- Personally tailored recommendations (yet)
- Instant or verified two-way Plex/Trakt sync (say “automatic syncing”; do not overclaim)
- Checkout / payment while coming-soon gates remain

---

## 4. Recommended build order

### Phase A — First paid (Linear, ordered)

Do **not** reorder. Paying users must get working sync before the first charge.

| Order | Issue | What |
| --- | --- | --- |
| 1 | [PLO-492](https://linear.app/savblack/issue/PLO-492) **Urgent / Scheduled** | Flip `SHOW_MEDIA_SYNC_INTEGRATIONS = true` (web + mobile). E2E verify Premium can connect + sync **Plex and Trakt**. Free still gated. |
| 2 | [PLO-494](https://linear.app/savblack/issue/PLO-494) | Point secrets + public copy at the **confirmed** live prices (see §2). |
| 3 | [PLO-493](https://linear.app/savblack/issue/PLO-493) | Restore Checkout: unstub `usePremium.startCheckout`, remove `premium_coming_soon` 503, wire Settings + `/plans`, update smoke tests. Real Checkout → webhook → `is_premium`. |

Also complete `docs/billing/stripe-launch.md` in live mode when going public: portal catalogue, webhook events, secrets, one real low-value purchase test.

**Out of scope for first charge:** Customer Portal polish (nice to have), mobile IAP.

### Phase B — Premium product features (after or in parallel with A, no charge required)

Suggested priority for “Less deciding. More watching.” (matches plans stories + Reddit positioning):

1. ~~Tonight’s movie picker~~ **Done: Pick for Me** (§5.2).
2. **Watchlist overlap + host collaborative lists** — social Premium; join stays Free. **In review as Watch together (PR #1039).**
3. **Unlimited lists** — mostly already gated; ensure UX/mobile parity and messaging when checkout opens.
4. **Live calendar subscription** — largely wired; polish Premium path and free “Request access” / snapshot.
5. **Deeper stats** — define what “additional” means beyond today’s Free overview.
6. **Smart lists** — filter rules that auto-update, including discoveries beyond saved titles.
7. **People alerts** + **whole-season-ready** — need notification infrastructure; season-ready needs verified episode-level availability.
8. **Customise your plot** — supporting Premium, not the lead; widgets / icons / themes / profile pages.

### Phase C — Related Free work (not Premium, but promised)

- Movie / episode **release notifications** (planned Free). High delight; do not ship Premium as alerts-only.
- Join collaborative lists / watch sessions as Free participant.

---

## 5. Feature briefs (for implementation agents)

Each brief: intent, acceptance sketch, existing hooks, constraints. Expand into tickets before coding schema-heavy items; confirm irreversibles with Savannah (`AGENTS.md` Decisions).

### 5.1 Automatic Plex + Trakt syncing — **Premium** (first paid gate)

**Intent:** Keep watch history current without another manual import. Manual import/export stays Free.

**Already built:**
- `supabase/functions/media-sync`, `supabase/functions/trakt-sync` (Premium-gated with `is_premium` → `premium_required`)
- Client hooks: `apps/web/src/hooks/useMediaSync.js`, mobile equivalents
- Flag: `SHOW_MEDIA_SYNC_INTEGRATIONS` in `apps/web/src/launchFeatures.js` and `apps/mobile/lib/launchFeatures.ts` (**false**)

**To build / verify (PLO-492):**
- Flip flag on both platforms
- Settings UI shows connect/sync for Premium (not coming-soon modal)
- Free users: upgrade path via Explore Premium, no free unlock
- E2E: Premium account completes Plex sync and Trakt sync successfully
- Copy: do not claim instant or verified two-way syncing

**Related (out of first-paid scope):** Plex → Overseerr/Sonarr/Radarr requests design in `docs/superpowers/specs/2026-08-23-plex-sonarr-radarr-requests-design.md`. Personal/homelab; productisation later. Fix `processOutbox` action filter before adding `media_request` actions.

### 5.2 Pick for Me (tonight picker) — **Premium**, live

**Shipped:** PR #1029, merged 2026-09-25 (`bec75da6`). Web `/tonight`, mobile `/(app)/tonight`. Nav label "Pick for Me" with a Premium pill for Free viewers; web icon is a starred list. Internal id and route stay `tonight`.

**How it works:**
- Four questions, one at a time: movie or show → length (movie runtime, or TV format + episode length) → what kind (genres with a mood word; 9 tiles on desktop, 10 on phone, alphabetical, "Show all") → how new, how good (era, TMDB score). Choosing never auto-advances; the viewer presses Next.
- A folding **Filters** panel under each question (both layouts): only my services, only my watchlist, hide kids and family (on by default), original language.
- A sentence builds as they answer ("Find me a movie under 2 hours, that's funny or tense, on my services.").
- **Pick** draws up to five (hero Top pick + cards); **Surprise me** draws one. Pool is watchlist + TMDB discover, excluding titles already watched. Copy never promises a count, since tight answers can return fewer.
- Results heading follows local time: "Tonight, sorted" 3:30pm to midnight, "Your shortlist" otherwise. Change options / Spin again.
- Desktop: 264px side column (Your request with "Or [Surprise me]", Questions list) beside the question; Pick sits where Next goes on the last question. Phone: sticky bar with the sentence, Surprise me and Pick.
- Page subline "Less deciding. More watching." (desktop only).
- No TMDB calls for picks until Pick is pressed; the genre catalog loads up front (one cached call) because Free viewers answer the questions too.

**Free viewers (the upsell, "try it first"):** they can answer every question. Pick and Surprise me carry a lock and open a pop-up over blurred placeholder picks (no real titles, nothing fetched): "plot Premium" pill, "Your request is ready. Unlock your picks.", three benefits, Upgrade to Premium (web → `/plans?from=/tonight`; mobile → in-app Premium preview in Settings, never an external purchase link), the price line, and a × to close. Their answers are saved on the device for 24 hours (key and format in `@plot/core`: `savedRequestKey`, `serialiseSavedRequest`, `parseSavedRequest`); back as Premium, the request is restored and drawn automatically.

**Safety already handled (from Greptile review):** results, watched history and the pool are keyed to the viewer; stale overlapping draws are dropped; picks hide the moment Premium ends; a saved watchlist-only request waits for the watchlist to load; failed TMDB requests show an error, not "nothing fits"; watch history is paged.

**Key files:** `packages/core/tonightPicker.js` (all logic, hook `useTonightPicker`), `packages/core/copy/tonightPicker.js` (copy, genre moods), `apps/web/src/components/TonightView.jsx` + `.css`, `apps/mobile/app/(app)/tonight.tsx`, `apps/web/src/stories/TonightView.stories.jsx` (incl. Free Answering / Free Unlock Pop Up). Design canvas: https://claude.ai/artifact/EGHxCibeReUW63RoNvesCZ (gate mockups there show older copy).

**Still to do:**
- Test the mobile screen on a device or simulator (type-checks only so far).
- Test "come back after upgrading" end to end once Checkout opens (or by granting Premium on Staging mid-flow).
- GitHub's "Code scanning AI findings" check fails on every PR with "requested model is not supported" (GitHub-side, not code); not a required check.

### 5.3 Watchlist overlap / “something you both want” — **Premium** (host)

**Intent:** Show titles on both people’s watchlists; help choose together. Not playback.

**Acceptance sketch:**
- Premium user picks a friend (follow relationship or explicit invite)
- Intersection of watchlists (respect privacy / blocks)
- Clear empty states; Free friend can participate in choosing without paying
- Copy must not imply Plot streams or syncs playback

**Existing:** Homepage “Together” preview only.

### 5.4 Create / host collaborative lists — **Premium**; join — **Free**

**Intent:** Host builds a shared list; invites Free friends to add titles.

**Acceptance sketch:**
- Only Premium can **create** collaborative / shared-list mode
- Invite link or in-app invite; joiners Free
- RLS: members can add/remove per agreed rules; host admin
- Distinct from private custom lists and from public profile lists

**Existing:** Custom lists + 5-cap Free. No collaborative membership model yet (schema + UX net-new). Confirm schema with Savannah before migrate (production auto-applies).

### 5.5 Unlimited custom lists — **Premium**

**Intent:** No cap for Premium; Free stays at 5.

**Already built:** `can_create_custom_list()`, `FREE_CUSTOM_LIST_CAP`, web sixth-list modal → Explore Premium, mobile alert.

**To finish:** When Checkout opens, replace coming-soon messaging with real upgrade → Checkout; keep server as authority; mobile still web-upgrade only.

### 5.6 Smart lists — **Premium**

**Intent:** Saved filter rules that auto-update lists, including discoveries beyond already-saved titles.

**Acceptance sketch:**
- Define rule DSL carefully (providers, genres, runtime, “new to me”, etc.)
- Recompute on a clear schedule or on open; show last-updated
- Premium-gated create/edit; do not silently run expensive jobs for Free

**Existing:** Copy only. Net-new.

### 5.7 Deeper viewing stats — **Premium**

**Intent:** Free keeps today’s limited overview; Premium adds **additional** stats (not a paywall on existing ones).

**Acceptance sketch:**
- Inventory current Free stats surfaces (web + mobile)
- Spec concrete Premium additions (e.g. longer ranges, breakdowns, year-in-review style) — **confirm with Savannah** what “deeper” means before building
- Gate new surfaces only; do not regress Free overview

**Note:** Launch decision (2026-08-13) shipped statistics entirely Free for relaunch. Premium = extras on top.

### 5.8 Live calendar subscription — **Premium**

**Intent:** Auto-updating calendar URL in the user’s calendar app. One-time `.ics` snapshot stays Free.

**Already built:**
- `calendar_token`, `calendar-feed` edge function
- Settings: Premium can generate/manage URL; non-Premium sees needs-Premium / Explore Premium; snapshot download not Premium-gated (`docs/qa/public-launch-checklist.md`)

**To finish:** Ensure path works end-to-end when Checkout is open; mobile parity; no secrets in exports (`export-user-data` already careful).

### 5.9 Actor / director release alerts — **Premium**

**Intent:** Follow people; notify on new releases.

**Depends on:** notification stack (push / email / in-app) from launch notification work. Movie/episode **title** release alerts are planned **Free** — people alerts stay Premium.

**Acceptance sketch:** Follow person → store preference → fire on new credit/release with region sanity → respect mute/unsubscribe.

### 5.10 Whole-season-ready alerts — **Premium**

**Intent:** Notify when **every** episode is verified available on the user’s selected services in their region. Airing dates alone do **not** qualify.

**Depends on:** episode-level availability data quality. Do not ship if evidence is only TMDB air dates.

**Acceptance sketch:** Explicit verification rule documented; false positives worse than silence.

### 5.11 Customise your plot — **Premium** (supporting, not lead)

**Intent:** Home Screen widgets, custom app icons, custom profile pages, themes. Make Plot feel like the user’s journal.

**Acceptance sketch:**
- Mobile-heavy (widgets, icons); themes/profile may be cross-platform
- Gate behind Premium; Free keeps current light/dark/system appearance
- Do not lead marketing with this alone

### 5.12 Checkout + billing UX — when Phase A complete

**Restore path (PLO-493):**
1. Restore real `startCheckout` in `apps/web/src/hooks/usePremium.js` (track `PREMIUM_CHECKOUT_STARTED`, redirect to Stripe)
2. Remove early 503 in `supabase/functions/stripe-billing/index.ts` for checkout
3. SettingsBilling + PlansPage call Checkout with `monthly` | `yearly`
4. Update `apps/web/tests/smoke/premium-preview.spec.js` (today asserts checkout closed)
5. Smoke: Checkout → webhook → `profiles.is_premium` / `billing_customers` → access

**Entitlement notes:**
- `is_premium()` is self-expiring off `billing_customers.subscription_status` + `current_period_end` (grace exists in webhook comments)
- Trigger forbids writing `profiles.is_premium` directly except billing
- One-month grant can use `subscription_status = 'trialing'` + future `current_period_end` without schema change

---

## 6. Platform / ops checklist when Premium “ships”

From `docs/launch/app-store-launch-sprint.md` and billing docs:

- [ ] Complete live Stripe checklist (`docs/billing/stripe-launch.md`)
- [ ] Flip / keep `SHOW_PRICING_PAGE` appropriately (web already `true`; website Pages env; mobile stays web-upgrade)
- [ ] Re-add `/plans.html` to `apps/website/llms.txt` and `apps/website/sitemap.xml` if still missing (were deleted, not gated)
- [ ] Deploy `stripe-billing` + `stripe-webhook`; confirm `verify_jwt` in `supabase/config.toml`
- [ ] Run `pnpm run edge:check` for function changes; `pnpm run staging:premium-flag-test` when touching entitlement SQL
- [ ] Analytics: premium conversion / status person props already exist (`packages/core/analyticsEvents.js`); do not invent duplicate events without `docs/analytics/README.md`

---

## 7. Key files

| Path | Role |
| --- | --- |
| `packages/core/copy/plansPage.js` | Canonical Free/Premium matrix + pricing copy |
| `packages/core/premium.js` | `FREE_CUSTOM_LIST_CAP`, `isPremiumProfile`, `canCreateCustomList`, friendly errors |
| `packages/core/copy/settingsView.js` | Settings Premium / sync / calendar coming-soon strings |
| `apps/web/src/hooks/usePremium.js` | Checkout stub + portal/tip |
| `apps/web/src/launchFeatures.js` | `SHOW_PRICING_PAGE`, `SHOW_MEDIA_SYNC_INTEGRATIONS` |
| `apps/mobile/lib/launchFeatures.ts` | Mobile flags (pricing page off) |
| `apps/web/src/pages/PlansPage.jsx` | Plans UI |
| `apps/web/src/utils/premiumExplore.js` | Safe `/plans?from=` helper |
| `supabase/functions/stripe-billing/index.ts` | Checkout 503 gate |
| `supabase/functions/stripe-webhook/index.ts` | Entitlement mirror |
| `supabase/functions/media-sync`, `trakt-sync` | Sync + `premium_required` |
| `docs/billing/stripe-launch.md` | Live go-live checklist |
| `docs/research/premium-positioning-2026-09-16.md` | Why the stories are ordered this way |

---

## 8. What not to do

- Do not put release notifications behind Premium (locked Free).
- Do not market leaving-soon until data is validated.
- Do not build IAP for first Premium ship.
- Do not treat Ko-fi as entitlement.
- Do not hardcode TMDB IDs in picker fixtures or demos.
- Do not put Premium product logic only in `apps/web` if mobile should share it: put derivation in `@plot/core`.
- Do not open Checkout before PLO-492 passes.
- Do not invent a second feature matrix outside `plansPage.js`.

---

## 9. Suggested first tickets for a pickup agent

If starting cold, in order:

1. **PLO-492** — enable + verify Plex/Trakt for Premium (blocks charge).
2. Confirm **pricing** with Savannah (§2), then PLO-494.
3. **PLO-493** — restore Checkout + smoke.
4. ~~Tonight’s movie picker~~ **Done: Pick for Me, web + mobile** (§5.2).
5. Collaborative lists / Watch together: review and land PR #1039; schema confirmed with Savannah before migrate.
6. Free **release notifications** in parallel if notification infra is ready (keeps Free tier competitive).

---

## 10. Open questions for Savannah (do not guess)

1. ~~Final currency and price~~ **Decided: US$3/month or US$24/year, USD primary, converted locally** (see §2). Still open: Adaptive Pricing vs fixed per-currency prices.
2. What concrete **deeper stats** belong in v1 Premium?
3. Collaborative lists: invite model (link vs follow-only), edit permissions, max members?
4. ~~Picker v1 pool~~ **Decided 2026-09-24: watchlist + discover.** Shipped as Pick for Me (§5.2).
5. Is **Customise your plot** in first Premium ship or a later supporting drop?
