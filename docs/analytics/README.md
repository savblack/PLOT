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

## Traps

Encoded here once so nobody rediscovers them.

- **Never sum Tier 2 as an event count.** An in-sequence episode tick fires
  `episode_watched` *and* `marked_watched`. Count distinct persons.
- **`watchlist_saved` is not always a save.** The `/save` deep link re-fires it
  with `already_saved: true` when the title was already there. The Tier 2 action
  filters those out; a raw event query does not.
- **`search_performed` is not comparable across platforms.** Web fires per
  debounced keystroke pause across three modes and carries `query_length`;
  mobile fires only for titles and omits it.
- **`trakt_connected` before 2026-08-18 is inflated.** It fired on the click,
  before Trakt's own authorize page, so abandoners counted. Now split into
  `trakt_connect_started` and `trakt_connected`.
- **`episode_watched` / `season_watched` before 2026-08-18 are inflated.**
  Progress is a single pointer, so un-ticking was the same write as ticking and
  reported the same event. Undo now fires `episode_unwatched` /
  `season_unwatched`.
- **`activated` is retired.** See above.

## Bots

Roughly 9 in 10 "people" on theplot.tv are scrapers: they fire one `$pageview`
plus `$web_vitals`, never `$pageleave`, and never return. They present as
ordinary desktop Chrome, Firefox and Edge, so user-agent blocklists do not touch
them, and posthog-js's built-in filter already misses them.

They are excluded behaviourally instead. The **Real visitors** cohort is anyone
who fired `$pageleave` or any in-app action. Every acquisition tile is scoped to
it. Never build an acquisition insight on a raw `$pageview` count.

## Dev and preview traffic

Analytics runs only on `theplot.tv`, `www.theplot.tv` and `app.theplot.tv`. The
allowlist lives in `apps/web/src/utils/analyticsHost.js` and is duplicated,
deliberately, in four places that cannot import it: `apps/website/js/config.js`
and the snippets injected by `supabase/functions/title-page`,
`supabase/functions/marketing-feed` and `functions/list/[id].js`. Keep all five
in agreement. Mobile has no hostname and gates on `__DEV__`.

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

**The live gap:** almost nothing inbound carries a `utm_source` at all, so
`$initial_utm_source` is empty for every person. The vanity links (`/ig`, `/x`,
`/th`) cover the bio link; per-post social links are still untagged, and mobile
has no acquisition attribution of any kind.

## The dashboard

**PLOT: the funnel** (`2007437`). Every tile filters internal and test accounts;
acquisition tiles are scoped to Real visitors.

1. Acquisition: landing to signup
2. Signup to first committed action
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

## Where things live

- Event names: `packages/core/analyticsEvents.js` (frozen, snake_case)
- Seam contracts: `packages/core/config.js`
- Seam wiring: `apps/web/src/main.jsx`, `apps/mobile/lib/configureCore.ts`
- Transport: `apps/web/src/lib/analytics.js`, `apps/mobile/lib/analytics.ts`
- Host allowlist: `apps/web/src/utils/analyticsHost.js` (+ four copies)

Engagement events fire from core seams, at the single canonical mutation site
per action, so there is exactly one emitter per action and no cross-surface
double counting. Add names to the catalog, never inline at a call site.
