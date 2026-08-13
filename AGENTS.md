# AGENTS.md — PLOT

PLOT is a movie & TV tracking app that should feel like a warm, aesthetic journal: built
around what you've watched, what you thought, and how it made you feel — and your first
stop for deciding what to watch instead of searching every streaming service one by one.

Solo project. There is no team to consult — when a decision is reversible, make it and
note it; when it's not, ask the author (see Decisions). This file is the standing brief:
follow it without being re-told. Tickets say only *what* to build.

## Never do these

- **Never guess or hardcode TMDB IDs.** They're opaque integers — a guessed ID returns the
  wrong title. Resolve at runtime via search; only reuse an ID that came from a prior TMDB
  response. Applies to sample data, tests, fixtures, hardcoded lists — everything.
  ```js
  const results = await tmdb.search(title);
  const match = results?.results?.find(r => r.media_type === 'movie' /* or 'tv' */);
  // match.id, match.poster_path are now correct
  ```
- **Never read `import.meta.env` / `process.env` inside `packages/core`.** Core is
  platform-agnostic. Apps call `configure()` once at startup; core reads via `getConfig()`.
  Bypassing this is the #1 cause of web↔mobile drift.
- **Never commit secrets.** Browser-safe values are `VITE_*` only. Service-role keys,
  `TMDB_API_KEY`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, etc. stay server/script-side and
  out of tracked files. Add new required vars to `.env.example`.
- **Never touch real user data in Supabase** without asking — PLOT has live end users.
  No auth-admin writes, password changes, or destructive migrations unprompted.
- **Never import bare `@plot/core`** — the barrel is intentionally empty. Import subpaths
  (`@plot/core/useWatchlist.js`) so a stray import doesn't pull side-effecting modules.

## Repository layout

npm-workspaces monorepo. `npm ci` at root installs everything. `legacy-peer-deps=true` in
`.npmrc` is **mandatory** (web and mobile pin different React patch versions).

- `packages/core/` (`@plot/core`) — platform-agnostic JS + JSDoc shared by web & mobile:
  data hooks (`useWatchlist.js`, `useHistory.js`, …), API access (`supabase.js`, `tmdb.js`),
  domain logic (`media.js`, `customLists.js`), `config.js`, `tokens.js`. No build step.
- `apps/web/` (`@plot/web`) — Vite + React SPA → Cloudflare Pages (output `apps/web/dist`).
  `src/`, `tests/`, `workers/tmdb-proxy/` + `workers/og/` (Cloudflare Workers). SSR routes
  are Pages Functions in the repo-root `functions/`, not under `apps/web/`.
- `apps/mobile/` (`@plot/mobile`) — Expo / React Native, TypeScript, expo-router.
  Platform seams in `lib/`. **See `apps/mobile/AGENTS.md` before writing mobile code.**
- `apps/website/` — static marketing site (theplot.tv) → Cloudflare Pages. Plain
  HTML/CSS/JS, no build step, **not an npm workspace.** SSR routes are Pages Functions
  in `apps/website/functions/` (admin-host routing via `functions/_middleware.js`).
  Serve it with `npm run dev:website`, never a plain static server — the pages render
  either way, but `functions/` routes 404 and the homepage's TMDB surfaces go silently
  empty. See `apps/website/README.md`.
- `supabase/` — `functions/` (Deno edge functions), `migrations/`, `config.toml`.
- `marketing/` — automation runbooks (see Marketing). `scripts/` — repo tooling.

## Commands

Run from repo root unless noted. Use **npm** (workspaces), never yarn/pnpm.

- `npm run dev` — web dev server (Vite, port 5177)
- `npm run dev:website` — marketing site + its Pages Functions (wrangler, port 5202)
- `npm run check` — **lint + build; run this before every PR** (after `npm ci`)
- `npm run lint` / `npm run build`
- `npm run test:unit` — `node --test` unit tests (`apps/web/tests/unit/`)
- `npm run test:smoke` — Playwright smoke (`vite build` + chromium; run
  `npx playwright install chromium` once on a fresh machine)
- `npm run typecheck -w @plot/mobile` — **required when touching mobile**; `npm run lint` covers it too
- Deploy: web app and marketing site both auto-deploy via Cloudflare Pages on merge to `main`;
  Supabase functions via `supabase functions deploy <name>`; Worker via
  `cd apps/web/workers/tmdb-proxy && npx wrangler deploy`.

## Tech stack

React 19 + react-router 7 + Vite 8 (web) · Expo 56 / RN 0.85 + TypeScript 6 (mobile) ·
plain JS ESM + JSDoc (core) · Supabase (Postgres + Deno edge functions) ·
Cloudflare Pages (web app + marketing site) hosting · Cloudflare Workers (TMDB proxy, OG) ·
PostHog (analytics) · Stripe (billing) · Resend (email).
CI on Node 22.

## Code style

- **The brand is always written `PLOT`** (all caps) in any prose, copy, or comments —
  never "Plot" or "plot". The only exceptions are code identifiers, tags, and URLs
  (e.g. the `@plot/core` package, the `plot` deploy project, `theplot.tv`).
- **Never use em dashes in user-facing copy.** Use a period, colon, comma, or parentheses
  instead. This applies to copy shown to users (UI strings, marketing, emails, legal
  pages) — code comments are unaffected.
- Match the surrounding file — no reformatting drive-bys. No Prettier config; don't add one.
- Web/core: components `PascalCase.jsx` (CSS co-located), hooks `useX.js` camelCase, core
  modules camelCase `.js`. Semicolons in source. Mobile route files follow expo-router naming.
- `no-unused-vars` errors, but names matching `^[A-Z_]` are exempt (intentional).
- **JSDoc is the type source** for `@plot/core` (mobile consumes it via `allowJs`) — keep
  `@typedef`/`@param` blocks accurate when you change a core signature.
- When logic is shared, put it in `@plot/core` and re-export from the web hook
  (e.g. `apps/web/src/hooks/useWatchlist.js` is just `export * from '@plot/core/useWatchlist.js'`).
  This applies to `hooks/`, `utils/` and `copy/`, which have their own reasons to keep a
  stable local path (hooks are imported by name across the app; `src/copy/` is what the
  Storybook Content pages read). It does **not** extend to inventing new shim directories:
  `src/api/` and `src/domain/` were exactly that and are gone. They held nine files, 27
  lines, zero behaviour, and 14 files imported both a shim *and* `@plot/core` directly for
  the same symbol — two paths to one module, picked at random. Import `@plot/core/…`
  directly unless a shim already exists.

## Region-aware spelling (US/UK)

PLOT spells words that differ between US and UK English (favorite/favourite, color/colour,
organize/organise, etc.) according to the viewer's own `profile.region`, via
**`packages/core/spelling.js`** — one shared dictionary for both apps. (`apps/web/src/utils/spelling.js`
and `apps/mobile/lib/spelling.ts` are re-export shims kept so existing import sites still
resolve; there is no longer a second copy to keep in sync.) Whenever new copy contains one
of these words:

- Check whether it already has a block in the `SPELLING` dictionary. If so, call
  `regionalWords('color', region)` (or `favoriteWords(region)`, the one named shortcut) —
  never hardcode the literal string.
- If not, add a new block to `packages/core/spelling.js` — `[US, UK]` pairs for each
  inflected form the copy needs (noun, plural, verb, -ing, -ed, …) — then call it. Don't
  hardcode the string and move on; the whole point is that the next word is a lookup, not
  a fresh hardcode.
- Region comes from the *viewer's own* profile (`useApp()` on web / `useAppData()` on
  mobile), not the profile being looked at — e.g. on someone else's public profile, pass
  `undefined` (US default) rather than that profile owner's region.
- Exception: Terms of Service and Privacy Policy copy is fixed British English regardless
  of viewer region — legal text stays one canonical wording, not personalized per reader.

## Web → mobile parity

Drift between the apps has historically been one-directional: web ships a feature, mobile
doesn't, and a few months later the two apps disagree about what PLOT is. `packages/core` is
the mechanism that prevents it, but only if you use it deliberately.

When you add or change a feature in `apps/web`:

- **Put the logic in `@plot/core` first**, not in `apps/web/src`. Anything free of DOM APIs
  belongs there — hooks included (`useDiscover`, `usePlatformCharts` and friends are core
  modules for exactly this reason). Web then imports it like mobile does. Rendering stays
  per-app; derivation, fetching and business rules do not.
- **If it can't be shared** (it's genuinely DOM- or RN-specific), say so in a comment at the
  top of the file and open a mobile parity issue in the same PR. "Mobile will catch up later"
  with nothing written down is how the last round of drift happened.
- **Never hand-port a core module into `apps/mobile/lib`.** If mobile needs a variant, widen
  the core module's arguments. Mobile previously carried its own `timezones.ts`,
  `importParsers.ts`, `spelling.ts` and five copies of `localDateStr`, all shadowing code that
  already existed in core.
- **Copy strings live in the shared catalog**, not inline in JSX, so both apps read the same
  wording. See `apps/web/src/copy/`.

Nothing in CI enforces this — lint and `tsc --noEmit` can't tell that a feature is missing.
It's a review-time responsibility.

## Architecture — seams that matter

- **Config injection** — `configure()` in `apps/web/src/main.jsx` and
  `apps/mobile/lib/configureCore.ts`; core reads `getConfig()`. (See Never-do #2.)
- **Supabase client** is a lazy `Proxy` — created after `configure()`. Web uses localStorage
  sessions; mobile injects AsyncStorage.
- **TMDB never exposes its key to the browser.** Requests go browser → Cloudflare Worker
  (rate limiting) → Supabase `tmdb-proxy` edge fn → TMDB. Frontend points at the Worker
  (`VITE_TMDB_PROXY_URL`), *not* the edge function directly.
- **PostHog** uses a cross-subdomain cookie so theplot.tv ↔ app.theplot.tv is one funnel;
  keep `apps/web/src/lib/analytics.js` and `website/js/config.js` in agreement.

## CI sync-guards — regenerate, don't hand-patch one side

These checks fail the build if two sources drift. Fix by regenerating both, not editing one:

- `tokens:check` — `apps/web/src/styles/tokens.css` must match `@plot/core/tokens.js`
  (canonical colors/radii; also feeds mobile).
- `footer:check` · `tokens:marketing` · `emails:check` — shared footer / website+email
  tokens / auth email templates.
- `migrations:check` — no migration may recreate a function with a different
  `ON CONFLICT` target without acknowledging it. See below.
- `copy:check` — no app file may hardcode a string that `packages/core/copy` owns.
- `core:check` — every `@plot/core/…` import must resolve to a file in this checkout.

**Why `core:check` exists when `tsc` already does this:** `tsc` is only reliable
from the repo root. Git worktrees live at `<repo>/.claude/worktrees/<name>`, i.e.
*inside* the main checkout, so a failed module lookup walks up the ancestor
`node_modules` chain and lands on the **parent** checkout's `@plot/core`. You
then typecheck against a tree you are not editing: a core module you deleted
still resolves, and a core export you just added does not — both pass silently.
A `tsconfig` `paths` mapping does **not** fix it (a mapping is a first attempt;
when it misses, resolution falls back to the same walk). If you need to trust a
local typecheck of `@plot/*`, run it from the main checkout or put the worktree
outside the repo. This blind spot is how #446 deleted `core/onboarding.js` with
a live importer still on `main`.

## Copy lives in `packages/core/copy` — never retype a shared string

Every user-facing string that both apps show comes from `packages/core/copy`, and both
apps import it. `apps/web/src/copy/*` are re-export shims so web's existing import paths
still resolve; the strings themselves live in core.

`npm run copy:check` fails the build if an app file contains a literal the catalog already
owns. This exists because a hardcoded string that happens to match today is invisible drift:
it diverges the moment either side is reworded, which is exactly what the catalog was built
to prevent. The catalog being *shared* is necessary but not sufficient — it has to be *read*.

- Adding copy? Put it in the surface's module (`settingsView.js`, `mediaPanel.js`, …).
- Used on three or more surfaces? It belongs in `common.js`, or `media.js` for anything
  about a title (watch status, list actions). Those two are the designated cross-surface
  modules and may be imported from anywhere.
- **Never define the same string in two catalog modules.** That reintroduces the drift one
  level up. `onboardingFlow.startWatchingArrow` ("begin using PLOT") and
  `media.startWatching` (the watch toggle) are deliberately different concepts that happen
  to share words — that's the one shape worth duplicating, and it's commented as such.
- Genuinely per-platform wording (mobile's compact labels, say) stays in the app file, but
  say why in a comment so the next person doesn't "fix" it into the catalog.
- `scripts/adopt-shared-copy.mjs` is a codemod that does the mechanical replacement when a
  new batch of copy moves into core. Run it with `--dry-run` first.

## Migrations: `create or replace function` replaces the WHOLE body

Recreating a function you didn't author means inheriting everything the previous version
fixed, and Postgres accepts a stale body silently. This has already caused a two-week
production outage: `20260718120000` widened `feed_posts`' unique key to include
`source_type` and updated the trigger's `ON CONFLICT` to match; `20260725000001` then
recreated the same function from the pre-widening body, pointing the upsert at a
constraint that no longer existed. Every write to `history` raised 42P10 and, because it
is an AFTER trigger in the same transaction, the user-facing write failed. Marking a title
watched was broken from 2026-07-25 to 2026-08-03 and nothing detected it.

So:

- **Before recreating an existing function, diff against what's live** — not against the
  migration you remember. `select pg_get_functiondef(oid) from pg_proc where proname = '…'`.
- `npm run migrations:check` fails the build if a redefinition changes the `ON CONFLICT`
  target. If the change is deliberate, add `-- redefines: <fn> (…why…)` to the migration.
- `npm run db:write-paths` checks the live database: every trigger function's upsert key
  must resolve against a real constraint, and every table it references must exist. Runs
  daily via `.github/workflows/db-write-paths.yml` and on any PR touching migrations.
  Read-only; it deliberately does not write-and-rollback, because `http_request` triggers
  on `profiles`/`feedback` are not reliably transactional.
- **A migration merged to `main` applies to PRODUCTION automatically** via the Supabase
  GitHub integration. There is no staging gate — write it as if it runs immediately.

**Supabase `config.toml` pins `verify_jwt` per function.** Public functions set
`verify_jwt = false`; forgetting it on redeploy makes the gateway reject requests before the
function runs (this has taken `/whats-on` and Stripe billing down). Deploy relies on this
file, not the `--no-verify-jwt` flag.

## Testing expectations

- Add/adjust unit tests for domain logic in `packages/core` and `apps/web/tests/unit/`.
- Run `npm run check` and any test suite touching your change before calling it done.
- Mobile has no test runner — `tsc --noEmit` plus ESLint are the safety net; run both for
  mobile changes.
- Mobile lint is ratcheted: `no-explicit-any` (~127) and `react-hooks/refs` (~34) are `warn`,
  not `error`, because of a pre-existing backlog. Don't add new ones, and don't "fix" a
  warning count by widening the rule — burn them down instead. Everything else is an error
  and must stay at zero.
- No coverage thresholds; use judgment. Cover the logic that would silently break.

## Git & PRs

- Branch off `main`; don't commit to `main` directly. Commit/push only when asked.
- Keep changes scoped to the ticket — no unrelated refactors or file churn.
- Conventional-commit style prefixes (`feat(...)`, `fix(...)`, `refactor(...)`) as in history.

## Decisions

- Reversible + low-risk → decide, do it, mention it. Don't ask permission to proceed.
- Irreversible or user-facing (schema/data migrations, anything touching live users,
  public posts, deletes, deploys to prod config) → confirm first.
- If a ticket conflicts with this file, this file wins — flag the conflict.

## Completion format & quality bar

When you finish, report in this shape:
1. **What changed** — one line per file/area, as clickable `path:line` links.
2. **How it was verified** — exact commands run and their result. If something failed or
   you skipped a step, say so plainly. Never claim "done" on unverified work.
3. **Follow-ups** — anything deferred or newly noticed, or "none."

Quality bar: it builds, `npm run check` passes, no new lint errors, no console noise, no
secrets added, no unrelated diffs. Design intent holds — flat monochrome (black/white/grey),
structure from hairlines and surface tokens, compact buttons never full-width. The `#E05578`
accent is reserved for approved interaction and hierarchy cues: Save, favourite, delete,
logout, active tabs/indicators, focus and hover states, selected filters/providers,
progress/completion, calendar selection/today, list/profile/settings status, and featured or
chart hierarchy. It is not decorative. Image overlays may use a scrim for readability;
avoid decorative gradients or glows. Shadows only to keep an element legible against what's
behind it (`--shadow-overlay`), never on text. Full rules and canonical sources:
`docs/design/shared-design-system.md`. If you can't meet the bar, stop and say why rather
than shipping a guess.

## Marketing

- Reviewing/approving/publishing the week's posts & newsletter → follow `marketing/REVIEW.md`.
- Writing post copy → follow `marketing/copy/AGENT.md`.
- Tempted to build a richer admin UI than `admin-review`? Read
  `docs/ops/operator-desk-shelved.md` first — that's already been tried once.

Model-agnostic runbooks: run from repo root on `main` with `.env` present, never a paid API
for copy, and **confirm before anything posts publicly.**

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root, shared by every
workspace. See `docs/agents/domain.md`.
