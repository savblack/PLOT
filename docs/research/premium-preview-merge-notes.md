# PLOT Premium preview: merge notes

The homepage now demonstrates three planned Premium benefits: choosing a film by time, service and mood; finding a shared watchlist match; and following actors/directors for new releases. Each panel animates once, rotates automatically, and can be selected with Tonight / Together / Following. Hover, focus, hidden tabs and offscreen sections pause rotation. Reduced-motion visitors can select panels without animations or automatic switching.

The homepage links to the public app `/plans` page. `/pricing` remains an alias. Both display planned features, US$3/month or US$24/year (taxes included), and a coming-soon response instead of checkout. Mobile Settings reads the same feature catalog. Existing subscriber management and tips are preserved. The billing endpoint rejects subscription checkout before customer or payment work.

## Free feature coverage

Tracking, episode progress, watchlist, ratings, reviews, discovery, recommendations, where-to-watch information, viewing statistics, the release calendar and calendar snapshot, social profiles, existing imports and exports remain Free.

Main now includes private watchlist notes and five custom lists, so the comparison lists both as included in Free. Joining a Premium host’s collaborative lists or shared watch sessions remains planned. This change adds no database migrations. Paid feature implementations are also outside this release. Departure alerts remain pending validation; whole-season availability requires verified episode-level service and region data.

## Verification

- `pnpm run check`: passed, zero errors; existing lint warnings remain.
- `pnpm run test:unit`: 834 tests passed before adding the carousel regression suite.
- `node --test apps/web/tests/unit/premiumCarousel.test.js`: four additional tests passed (rotation/wrap, interaction/visibility pauses, reduced-motion manual navigation, verified example/filter consistency).
- `pnpm exec eslint apps/web/tests/unit/premiumCarousel.test.js`: passed.
- `pnpm run test:website`: 10 tests passed.
- `pnpm run copy:check` and `pnpm run core:check`: passed.
- `pnpm --filter @plot/mobile run typecheck`: passed; mobile has not been exercised on a device in this review.
- `pnpm run edge:check`: all 22 functions typechecked; edge lint passed.
- `CHOKIDAR_USEPOLLING=1 pnpm --filter @plot/web exec playwright test tests/smoke/premium-preview.spec.js`: both 390px and 1440px checkout tests passed. Chromium initially failed to start inside the macOS sandbox; rerun outside the sandbox passed.
- Local browser: all three homepage selectors update the panel at phone width without horizontal overflow.
- `git diff --check`: passed.

## Release boundary

This PR adds no database migrations or production data writes. Merging to main deploys the web app and marketing site. The Supabase GitHub integration deploys the changed `stripe-billing` endpoint after merge; verify its checkout response before declaring the release complete.

The notifications, film recommendation, selected services and illustrated watchlist match are examples, not real availability or release announcements. New subscriptions remain closed until a separate launch change explicitly enables them.

## Verified artwork and examples (17 September 2026)

All poster and profile paths were resolved through PLOT's TMDB proxy searches, not guessed. See `premium-example-evidence.json` for the returned IDs, paths, credits, runtime, genres and Australian subscription providers. Remote artwork uses the existing TMDB image host allowed by the website CSP; lazy loading and fixed image boxes avoid unnecessary requests and layout shifts. Failed images reveal the existing geometric/initials fallback.

- Tonight: The Grand Budapest Hotel, 100 minutes, Comedy, with the 120-minute limit selected. Disney Plus appears in the Australian `flatrate` provider response (not only rental/purchase). Only Disney+ is selected in the illustration. The caption explicitly identifies Australia and the verification date; this is a dated marketing example, not a live personalised recommendation. Recheck availability before future releases that update this example.
- Together: Widow's Bay (TV) appears in both illustrative lists, alongside Dune: Part Two and Materialists. All three posters were resolved through TMDB title searches, using TV search for Widow’s Bay. No real user's watchlist is represented.
- Following: Cillian Murphy's TMDB cast credit identifies Tommy Shelby in Peaky Blinders: The Immortal Man. Netflix's official Media Center confirms the cast credit: https://media.netflix.com/en/only-on-netflix/81319485 . The panel says Released 2026, not upcoming or just released.
- Following: Greta Gerwig's TMDB crew credit is Director for Narnia: The Magician's Nephew. Netflix confirms the directing credit and announced project: https://www.netflix.com/tudum/articles/narnia-release-date . The panel says Announced, with no invented premiere date or live notification timestamp.
- Browser verification: all seven poster/portrait image elements loaded successfully. Updated lint/build and four focused regression tests passed.

Artwork and content are integrated into the actual website source, not a separate mockup. Merge requested by the author on 17 September 2026.
