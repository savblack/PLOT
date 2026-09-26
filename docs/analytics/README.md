# PLOT analytics

What the numbers mean, where they are defined, and what not to trust.

PostHog project **PLOT** (`471234`, US cloud). One project serves the web app,
the marketing site, mobile, and four server-rendered surfaces.

## What counts as an active user

Three tiers, defined in PostHog as Actions and cohorts rather than in code, so
the bar can move without a deploy.

| Tier | Definition | Where |
|---|---|---|
| 1. Explorer | Any in-app action, browsing included | Action "Any in-app action (Tier 1)" |
| 2. Committed | A durable write to the user's own library. **This is activation.** | Action "Committed action (Tier 2)", cohort "Activated (committed action)" |
| 3. Retained | A committed action in 2+ distinct weeks | Cohort "Retained (returned and acted)" |

Tier 2 events: `watchlist_saved` (filtered to `already_saved != true`),
`marked_watched`, `rating_set`, `favourite_added`, `list_item_added`,
`custom_list_created`, `watching_started`, `season_watched`,
`series_completed`, `import_completed`, `user_followed`, `plex_connected`,
`trakt_connected`.

Tier 1 adds `title_viewed`, `search_performed`, `discover_tab_changed`,
`watch_link_clicked`. It deliberately excludes `$pageview` and `$autocapture`,
so bot traffic cannot qualify.

### Why activation is not an event

There used to be an `activated` event, fired once per browser behind a
`plot_activated` localStorage key. "Has this person activated" is a question
about their whole history, and a single browser cannot answer it: the guard
re-fired for the same user on a new device, never fired for anyone who existed
before it shipped, and because sign-out never cleared it, a second user on a
shared browser could never activate. It ended up just mirroring
`onboarding_completed`.

The cohort is person-scoped and retroactive, so it is correct across devices and
correct for users who predate the instrumentation. Historical `activated` events
still exist with the old meaning and are **not** comparable to the cohort.

`EVENTS.ACTIVATED` stays in `packages/core/analyticsEvents.js`, marked retired.
Removing a key from the frozen object would turn any missed call site into a
silent `undefined` event name.

### The funnel that outlived it

**Signup to activation funnel** (insight `10457477`) is
`user_signed_up → onboarding_completed → Self-directed committed action`, seven-day
window, test accounts filtered. Step 3 was the `activated` event until 2026-09-06,
and nobody repointed it when the event was retired, because PostHog's setup wizard
created the insight rather than a person.

It therefore reported a false 8.33% for the week of 2026-08-17, and PostHog's
self-driving inbox escalated that as a real activation collapse. Six of that week's
twelve signups arrived after `activated` stopped firing on 2026-08-18 and could not
convert at any rate but zero; of the five who did fire it, four fired it before
`onboarding_completed`, so the ordering discarded them. One survivor out of twelve.
The ordering defect predates the retirement — the 22.22% the same funnel showed for
the week of 2026-08-10 was wrong too, when the true figure was eight of nine.

That week was in fact the best on record: twelve signups, twelve onboarding
completions, ten committed actions, no `auth_callback_failed`. The database agrees
independently — nine people wrote their first ever `list_items` row that week, also
the highest.

Step 3 must stay **self-directed**. A plain committed action sitting behind
`onboarding_completed` walks straight into the seed-pick trap below. And expect this
funnel to read in the twenties rather than the eighties: "acted at all" and "acted
unprompted" are different questions, and this one asks the second.

## Traps

Encoded here once so nobody rediscovers them.

- **Never sum Tier 2 as an event count.** An in-sequence episode tick fires
  `episode_watched` *and* `marked_watched`. Count distinct persons.
- **`watchlist_saved` is not always a save.** The `/save` deep link re-fires it
  with `already_saved: true` when the title was already there. The Tier 2 action
  filters those out; a raw event query does not.
- **`search_performed` is not comparable across platforms.** Web fires per
  debounced keystroke pause and carries `query_length`; mobile fires only for
  titles and omits it. Web's `mode` changed meaning on 2026-09-16: before, it
  was the tab (`titles` / `talent` / `friends`); since the search palette it
  is the scope (`all` for one unified search across titles, franchises,
  people and friends, or `friends` / `people` when the query was prefixed with
  `@` or `/`). `result_count` counts the merged list.
- **`trakt_connected` before 2026-08-18 is inflated.** It fired on the click,
  before Trakt's own authorize page, so abandoners counted. Now split into
  `trakt_connect_started` and `trakt_connected`.
- **`episode_watched` / `season_watched` before 2026-08-18 are inflated.**
  Progress is a single pointer, so un-ticking was the same write as ticking and
  reported the same event. Undo now fires `episode_unwatched` /
  `season_unwatched`.
- **`activated` is retired.** See above.
- **`engagement_prompt_shown` / `engagement_prompt_dismissed` are not Tier 2.**
  They measure the in-panel watch/rate prompts (PLO-473 / PLO-474): exposure
  and how people leave (`action`: `not_yet`, `skip`, `write_review`). Accepting
  Mark as watched or setting a star still fires `marked_watched` / `rating_set`
  from the canonical seams; do not treat prompt events as committed actions.
- **Onboarding seed picks fire *before* `onboarding_completed`.** The seed step
  calls `addToList()` in a loop and only then tracks completion
  (`OnboardingFlow.jsx`), so those `watchlist_saved` events precede the
  completion event. Any **ordered** funnel of
  `onboarding_completed → committed action` therefore cannot see them: it
  reported 4 people when 22 had in fact saved something. If the question is "did
  they act after onboarding", use the **Self-directed committed action** action,
  which excludes `source: 'onboarding'` outright. Do not fix it by reordering
  steps.

## Bots

Roughly 9 in 10 "people" on theplot.tv are scrapers: they fire one `$pageview`
plus `$web_vitals`, never `$pageleave`, and never return. They present as
ordinary desktop Chrome, Firefox and Edge, so user-agent blocklists do not touch
them, and posthog-js's built-in filter already misses them.

They are excluded behaviourally instead. The **Real visitors** cohort is anyone
who fired `$pageleave` or any in-app action. Every acquisition tile is scoped to
it. Never build an acquisition insight on a raw `$pageview` count.

Scoping a tile to a cohort only works where you control the query, and PostHog's
own **Web analytics** product is not one of those places — it has no cohort
scope. So the same population is *also* defined as the **Bots (landed, never
engaged)** cohort (553124) and added to `test_account_filters` as a `not_in`
rule, which Web analytics does respect. Same people, two mechanisms, because the
two surfaces filter differently.

Bots are the exact complement of Real visitors, widened so it can never swallow
a person: a `$pageview` and then no Tier 1 action (it negates **action 333111**,
not a list of event names, so it tracks the catalog on its own), no `$pageleave`,
and none of `signup_cta_clicked` / `login_click` / `save_cta_clicked` /
`signup_form_viewed` / `signup_form_started` / `signup_submit_clicked` /
`user_signed_up` / `user_logged_in`.

Those first three matter more than they look. They fire from the marketing and
server-rendered surfaces on `theplot.tv` — the very host the crawlers hit — so
without them a real click-through to the app would be filed as a bot. The first
draft of this cohort had exactly that defect and caught two real people, both of
whom had reached the signup form and gone no further. They are the population
the signup-friction funnel exists to study, and filtering them out globally
would have quietly emptied the tile that studies them.

If you add an event that signals human intent from a surface Tier 1 does not
cover, negate it here too.

## Dev and preview traffic

Analytics runs only on `theplot.tv`, `www.theplot.tv` and `app.theplot.tv`. This
covers **both** PostHog and Google Analytics / GTM (`G-PYLHY9JMK1`,
`GTM-PC72PHBN`), which had the same defect and were fixed separately.

The allowlist lives in `apps/web/src/utils/analyticsHost.js` and is duplicated,
deliberately, in places that cannot import it: `apps/website/js/config.js`, the
`PLOT_ANALYTICS_OFF` bootstrap in the six `apps/website/*.html` pages, and the
snippets injected by `supabase/functions/title-page`,
`supabase/functions/marketing-feed` and `functions/list/[id].js`. Keep them in
agreement. Mobile has no hostname and gates on `__DEV__`.

Two flags on the marketing site, kept apart on purpose:

- `window.PLOT_DNT` — the visitor opted out via `?dnt=1`. A privacy choice.
- `window.PLOT_ANALYTICS_OFF` — `PLOT_DNT` **or** a non-production host. This is
  what the GA and GTM guards read.

Don't collapse them into one boolean. The `?dnt=1` cookie is scoped to
`domain=.theplot.tv`, which the browser rejects on localhost and `*.pages.dev`,
so it can never express the host case anyway.

When adding a script tag for any analytics vendor, inject it from JavaScript
inside the guard. A bare `<script src>` loads regardless of an enclosing `if` —
that was the actual bug in the two server-rendered surfaces.

To report from a dev server on purpose, set `VITE_PUBLIC_POSTHOG_FORCE=1` (or
`EXPO_PUBLIC_POSTHOG_FORCE=1`). Never set either in CI or the Cloudflare build
env: Vite inlines it at build time, so setting it on Pages would turn the gate
off for a whole deployment.

Events captured before 2026-08-18 still contain dev and preview traffic. The
project's internal-and-test filter excludes them by `$host`, and that toggle is
default-checked, so insights clean up retroactively.

## Attribution

First touch is captured in `apps/web/src/utils/attribution.js` (localStorage
`plot_attribution`) and written as `$set_once` person properties. A
cross-subdomain cookie on `.theplot.tv` makes theplot.tv and app.theplot.tv one
person, and `identify()` on signup merges the anonymous pre-signup history onto
the account. That chain works: signups carry 20 to 176 pre-signup events.

Super properties are registered under `first_*` names. Registering raw `utm_*`
would stamp each person's first-touch source onto every event they ever fire,
overwriting the campaign the event actually happened under.

Every surface forwards the visitor's real `utm_*`, click ids, `ref`, `src` and
referrer host onto app links, with existing params winning so each page keeps
its own `src` identity. Page identity belongs in `src`, never in `utm_source`.

What’s On article save links also put the exact article slug in `utm_content`.
It is retained in first-touch attribution and registered separately as the
session property `current_article_slug`, so a signup can be analysed by both
the person's original acquisition source and the article they acted on now.

**The live gap:** almost nothing inbound carries a `utm_source` at all, so
`$initial_utm_source` is empty for every person. The vanity links (`/ig`, `/x`,
`/th`) cover the bio link; per-post social links are still untagged, and mobile
has no acquisition attribution of any kind.

## Error tracking

Six surfaces report unhandled errors. What each one uses, and what it cannot
see:

| Surface | Automatic capture | Manual |
|---|---|---|
| Web app | posthog-js `capture_exceptions` (off under `import.meta.env.DEV`) | `ErrorBoundary`, `RouteErrorBoundary` |
| Marketing site | snippet `capture_exceptions` | — |
| title-page / marketing-feed / list pages | snippet `capture_exceptions` | — |
| Mobile | `installGlobalErrorHandlers()` in `lib/analytics.ts` | `components/ErrorBoundary.tsx` |

`kofi-webhook` is the seventh sender and is not in the table: it posts to
PostHog's HTTP capture API from Deno, with no SDK and no browser, so it has no
exception capture and a failed delivery shows up in the function's own logs.

Until 2026-09-11 only the web app reported anything. The other four browser
surfaces run the PostHog snippet and had `capture_pageview` and `autocapture`
but not `capture_exceptions`, so a landing page that broke for real visitors
produced no signal at all — and that page is the top of the funnel. Mobile had
only the React error boundary, which sees render-time throws and nothing from
an event handler, a `.then()`, a timer or native code.

Mobile is hand-wired because posthog-react-native has no `capture_exceptions`
equivalent — it ships `captureException` and an `ErrorBoundary` and nothing
else. `installGlobalErrorHandlers()` chains `ErrorUtils.setGlobalHandler` (it
calls the previous handler, so the red box and the native crash reporter still
run) and installs `HermesInternal.enablePromiseRejectionTracker`. RN only
enables that tracker itself under `__DEV__`, and mobile analytics only run when
`__DEV__` is false, so the two never contend. A fatal flushes the queue before
the process goes away. Delete both if the SDK ever grows the option.

### "Script error." and why it is dropped

When a third-party script throws and it was **not** loaded with CORS, the
same-origin policy strips everything before `window.onerror` sees it: no
message, no filename, no stack — just the string `Script error.`. posthog-js
captures that faithfully, and the result is an Error Tracking issue that can
only be closed, never diagnosed. Two arrived from Turnstile on 2026-08-31 and
cost a triage report to establish that there was nothing to establish.

The fix is at the source: every third-party script is now injected with
`crossOrigin = 'anonymous'`, so errors arrive with a message and a stack.
Turnstile got it in #624; the Google tags (`gtag/js` and `gtm.js`) on the
marketing site and the two rendered surfaces got it at the same time as the
capture rollout above. Both hosts support it — `challenges.cloudflare.com`
sends `access-control-allow-origin: *` on the 302 and its target, and
`googletagmanager.com` reflects the `Origin` header and sends `Vary: Origin`.
**Any new third-party `<script>` must set it too.**

The backstop is a `before_send` hook that drops an exception carrying no
actionable detail. It is deliberately narrow: an entry qualifies only when it
is **both** synthetic (the browser fabricated the `Error`, rather than the page
throwing one) **and** has no stack frames. A synthetic exception with frames is
real signal, and so may be a stackless one the page threw itself.

The predicate exists in five places, because the four snippet surfaces cannot
import: `apps/web/src/utils/opaqueException.js` is the real one, and each
snippet carries a hand-written `dropOpaqueException`.
`apps/web/tests/unit/opaqueExceptionParity.test.js` extracts all four copies,
runs them, and holds them to the same answers as the app's — three of them are
single-line, where a stray paren would otherwise ship a page whose analytics
throws on load.

## PostHog settings that are not in this repo

These were changed through the API on 2026-08-18 and exist only in the PostHog
project. Nothing in version control reflects them, so the previous values are
recorded here to keep the change reversible.

| Setting | Was | Now | Why |
|---|---|---|---|
| `autocapture_web_vitals_opt_in` | `true` | `false` | 2,054 events/30d across 1,076 people, almost entirely bots. Answers no question being asked. |
| `recording_domains` | `null` (all) | `["https://app.theplot.tv"]` | Stops recording bot sessions on the marketing site. |
| `session_recording_minimum_duration_milliseconds` | `null` | `5000` | Drops drive-by sessions never worth watching. |
| `test_account_filters` | 3 email rules + cohort 362972 | those, plus `$host` not containing `localhost` / `127.0.0.1` / `pages.dev` / `preview.theplot.tv`, plus `$internal_or_test_user` is not true | Retroactive: the toggle is default-checked, so existing insights clean up without a deploy. |
| `test_account_filters` (2026-09-06) | the nine rules above | those, plus cohort 553124 `not_in` | Web analytics showed a 1.2K-session crawler burst on 2026-08-13 as real traffic. Nothing in the nine rules touched it: the crawlers sit on the production host with no email and no cohort. Retroactive, same default-checked toggle. |

Unchanged and worth knowing: `session_recording_opt_in: true`,
`autocapture_opt_out: false`, `heatmaps_opt_in: true`,
`test_account_filters_default_checked: true`.

Objects created at the same time:

| Kind | Name | ID |
|---|---|---|
| Dashboard | PLOT: the funnel | 2007437 |
| Action | Committed action (Tier 2) | 333110 |
| Action | Any in-app action (Tier 1) | 333111 |
| Action | Self-directed committed action | 342069 |
| Cohort | Real visitors | 494034 |
| Cohort | Activated (committed action) | 494035 |
| Cohort | Retained (returned and acted) | 494036 |
| Cohort | Internal / Test users (pre-existing) | 362972 |
| Cohort | Bots (landed, never engaged) — added 2026-09-06 | 553124 |

`POSTHOG_PERSONAL_API_KEY` in the root `.env` is scoped to project 471234 and
can read and write all of the above via `https://us.posthog.com/api/projects/471234/`.
Note the API host is `us.posthog.com`, not the `us.i.posthog.com` ingest host,
and org-level endpoints such as `/api/projects/` return 403 because the key is
project-scoped.

## The dashboard

**PLOT: the funnel** (`2007437`). Every tile filters internal and test accounts;
acquisition tiles are scoped to Real visitors.

1. Acquisition: landing to signup
2. Signup to using the product unprompted
3. Retention on committed actions
4. The three engagement tiers, weekly
5. Friction: where sign-in and signup die
6. The core product loop
7. Where real visitors actually come from

## Cross-checking against the database

PostHog can be wrong (ad blockers, DNT, failed callbacks). These reconstruct the
same numbers independently and retroactively:

| Question | Query |
|---|---|
| Signups | `count(auth.users)` by `created_at` |
| Onboarding completion | `profiles.onboarding_complete = true` |
| Activation | `exists(select 1 from list_items where user_id = X)`, first at `min(created_at)` |
| Last active | `max(watching_progress.updated_at)` |

A signup in the database with no PostHog `user_signed_up` is usually a sign-in
that died at the OAuth callback. `auth_callback_failed` (added in #550) is the
only signal for it; `auth.flow_state` holds the forensics.

## The ingest host

Everything ingests through `https://a.theplot.tv`, PostHog's managed reverse
proxy (org settings → Managed reverse proxy), so events aren't dropped by ad
blockers targeting PostHog's own domains. No surface points at
`us.i.posthog.com` or `us-assets.i.posthog.com`, and neither is in any CSP
allowlist. `ui_host` stays `https://us.posthog.com` so PostHog's own links
(session replay URLs) point back at the real dashboard.

Seven places send to it. Five hardcode the host — `apps/website/js/config.js`,
`supabase/functions/title-page`, `supabase/functions/marketing-feed`,
`functions/list/[id].js`, and the server-side capture in
`supabase/functions/kofi-webhook`. The web and mobile apps instead read
`VITE_PUBLIC_POSTHOG_HOST` / `EXPO_PUBLIC_POSTHOG_HOST`, each defaulting to the
proxy; web's is set per-deployment in the Cloudflare Pages dashboard.
That split has bitten once: the proxy landed in 88d52b7 (2026-07-28) and moved
every hardcoded init, but the Pages variable kept its pre-proxy value, so the app
went on reporting direct for weeks with nothing in the repo to show it.
`main.jsx` now defaults to the proxy when the variable is unset or empty, which
makes the repo the source of truth — but an explicitly stale variable still wins,
so the dashboard value has to be right too.

posthog-js needs no `asset_host`: it resolves `/static/*` against `api_host`
whenever `asset_host` is null, so the recorder and surveys load from the proxy on
their own. The four snippet surfaces build the same URL via
`api_host.replace('.i.posthog.com', '-assets.i.posthog.com')`, which is a no-op
for a non-PostHog host and therefore also lands on the proxy.

## Where things live

- Event names: `packages/core/analyticsEvents.js` (frozen, snake_case)
- Seam contracts: `packages/core/config.js`
- Seam wiring: `apps/web/src/main.jsx`, `apps/mobile/lib/configureCore.ts`
- Transport: `apps/web/src/lib/analytics.js`, `apps/mobile/lib/analytics.ts`
- Host allowlist: `apps/web/src/utils/analyticsHost.js` (+ four copies)
- Opaque-error filter: `apps/web/src/utils/opaqueException.js` (+ four copies)

Engagement events fire from core seams, at the single canonical mutation site
per action, so there is exactly one emitter per action and no cross-surface
double counting. Add names to the catalog, never inline at a call site.
