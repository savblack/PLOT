# AGENTS.md — Plot

Plot is a movie & TV tracking app that should feel like a warm, aesthetic journal: built
around what you've watched, what you thought, and how it made you feel — and your first
stop for deciding what to watch instead of searching every streaming service one by one.

Solo project. There is no team to consult — when a decision is reversible, make it and
note it; when it's not, ask the author (see Decisions). This file is the standing brief:
follow it without being re-told. Tickets say only *what* to build.

## Settled external approvals

- **TMDB licence:** TMDB clearance is confirmed by Savannah. Plot has TMDB's approval
  to use its API without a contract. This is not a launch blocker. Historical quotes
  are not current cost assumptions. Do not ask Savannah to reconfirm this unless new
  evidence from TMDB directly contradicts it.

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
  `TMDB_API_KEY`, `RESEND_API_KEY`, etc. stay server/script-side and
  out of tracked files. Document new required vars (web `VITE_*` in the README's
  local-setup list; mobile in `apps/mobile/.env.example`). **There is no root
  `.env.example`** and `.gitignore` no longer lets one be committed. It was deleted on
  2026-09-18, restored by #1046 on 2026-09-26 with nobody noticing, and deleted again on
  2026-09-29. It duplicated the README and carried a live publishable key.
- **Never touch real user data in Supabase** without asking — Plot has live end users.
  No auth-admin writes, password changes, or destructive migrations unprompted.
- **Never import bare `@plot/core`** — the barrel is intentionally empty. Import subpaths
  (`@plot/core/useWatchlist.js`) so a stray import doesn't pull side-effecting modules.

## Repository layout

pnpm-workspaces monorepo (members in `pnpm-workspace.yaml`). `pnpm install --frozen-lockfile` at root
installs everything. Two settings in `.npmrc` are **mandatory**: `node-linker=hoisted` (Metro and
`scripts/check-expo-sdk-deps.mjs` both assume a flat, hoisted `node_modules`) and
`strict-peer-dependencies=false` (web and mobile pin different React patch versions).
See `docs/ops/package-manager.md`.

- `packages/core/` (`@plot/core`) — platform-agnostic JS + JSDoc shared by web & mobile:
  data hooks (`useWatchlist.js`, `useHistory.js`, …), API access (`supabase.js`, `tmdb.js`),
  domain logic (`media.js`, `customLists.js`), `config.js`, `tokens.js`. No build step.
- `apps/web/` (`@plot/web`) — Vite + React SPA → Cloudflare Pages (output `apps/web/dist`).
  `src/`, `tests/`, `workers/tmdb-proxy/` (Cloudflare Worker). SSR routes
  are Pages Functions in the repo-root `functions/`, not under `apps/web/`.
- `apps/mobile/` (`@plot/mobile`) — Expo / React Native, TypeScript, expo-router.
  Platform seams in `lib/`. **See `apps/mobile/AGENTS.md` before writing mobile code.**
- `apps/website/` — static marketing site (theplot.tv) → Cloudflare Pages. Plain
  HTML/CSS/JS, **no build step** — the site ships as-is. The directory *is* a
  workspace member, but only as `@plot/website-storybook`, a documentation-only
  Storybook that neither builds nor serves the site. SSR routes are Pages Functions
  in `apps/website/functions/` (admin-host routing via `functions/_middleware.js`).
  Serve it with `pnpm run dev:website`, never a plain static server — the pages render
  either way, but `functions/` routes 404 and the homepage's TMDB surfaces go silently
  empty. See `apps/website/README.md`.
- `supabase/` — `functions/` (Deno edge functions), `migrations/`, `config.toml`.
- `marketing/` — automation runbooks (see Marketing). `scripts/` — repo tooling.

## Commands

Run from repo root unless noted. Use **pnpm**, never npm or yarn — an npm lockfile
resolves a second, unhoisted dependency graph that Metro and
`check-expo-sdk-deps.mjs` cannot read. `package-lock.json` and `yarn.lock` are
gitignored so a stray one cannot be committed, but delete it rather than leave it.

- `pnpm run dev` — web dev server (Vite, port 5177)
- `pnpm run dev:website` — marketing site + its Pages Functions (wrangler, port 5202)
- `pnpm run check` — **lint + build; run this before every PR** (after `pnpm install --frozen-lockfile`)
- `pnpm run lint` / `pnpm run build`
- `pnpm run test:unit` — `node --test` unit tests (`apps/web/tests/unit/`)
- `pnpm run test:smoke` — Playwright smoke (`vite build` + chromium; run
  `npx playwright install chromium` once on a fresh machine)
- `pnpm --filter @plot/mobile` run typecheck — **required when touching mobile**; `pnpm run lint` covers it too
- `pnpm run edge:check` — **required when touching `supabase/functions/`**; type-checks every
  edge function with `deno check` against the generated DB types. Nothing else type-checks
  them, so this is the only gate for that. Needs `deno` on PATH. If it reports columns that
  do exist, the types are stale: `pnpm run gen:db-types` regenerates
  `supabase/functions/_shared/database.types.ts` from production's schema (read-only, needs
  `SUPABASE_ACCESS_TOKEN`), and it should be committed with the migration that moved the schema.

  **Green here does not mean it will deploy.** The check resolves against the committed
  `deno.lock` with `--node-modules-dir=none`; the deployed function resolves its own versions
  in Supabase's runtime, and the integration *bundles* rather than type-checks. A bundling
  failure is invisible to this gate by construction. On 2026-10-02 the integration returned
  `failed to bundle function: exit status 1` for a web-only commit while `edge:check` was
  green on `main` (issue #1136; it recovered on its own two deploys later). The only signal
  for that class is the integration's own verdict, which `.github/workflows/supabase-deploy-guard.yml`
  watches and raises an issue for. So run `edge:check` before merging, and watch the guard
  after.
- Deploy: web app and marketing site both auto-deploy via Cloudflare Pages on merge to `main`;
  Supabase functions via `supabase functions deploy <name>`; Workers under
  `apps/web/workers/` deploy on merge via `.github/workflows/workers-deploy.yml`
  (needs the `CLOUDFLARE_API_TOKEN` repo secret; by hand: `cd apps/web/workers/<name> && npx wrangler deploy`).

## Tech stack

React 19 + react-router 7 + Vite 8 (web) · Expo 57 / RN 0.87 + TypeScript 6 (mobile) ·
plain JS ESM + JSDoc (core) · Supabase (Postgres + Deno edge functions) ·
Cloudflare Pages (web app + marketing site) hosting · Cloudflare Workers (TMDB proxy, OG) ·
PostHog (analytics) · Stripe (billing) · Resend (email).
CI on Node 22.

## Code style

- **Brand casing follows its typography.** Write `plot` in the logo and anywhere the
  brand is set in Gabarito; write `Plot` in all other prose, copy, and comments. Code
  identifiers, tags, and URLs remain lowercase where required (e.g. the `@plot/core`
  package, the `plot` deploy project, `theplot.tv`).
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

## Spelling

Plot's primary market is the United States. User-facing copy is American English:
color, favorite, theater, organize, program, and the other -ize forms. That covers
the apps, the marketing site, social posts, What's On, card text, alt text, and email.

Marketing copy is for a US reader. Use US release dates, US streaming services,
US references, and US date order (June 19, Friday, June 19) when a date is written
out. Do not localize marketing for Australia or the UK.

Legal pages stay as they are. Terms of Service, Privacy Policy, Community Standards,
and any other legal page keep their current wording, including British spelling
where the text already uses it. Do not "correct" them to American spelling.

`packages/core/spelling.js` still switches a few already-shipped words (favorite,
color, and the rest of that dictionary) from the viewer's `profile.region`.
(`apps/web/src/utils/spelling.js` and `apps/mobile/lib/spelling.ts` are re-export
shims.) Leave those call sites alone unless a ticket asks for the sweep. Do not
add new words to the dictionary, and do not add new `regionalWords()` call sites.
A new string is American spelling, written out.

If you do touch an existing call site, region still comes from the viewer's own
profile (`useApp()` on web, `useAppData()` on mobile), not the profile being
looked at. On someone else's public profile, pass `undefined` (US) rather than
that profile owner's region.

## Web → mobile parity

Adding or changing a feature in `apps/web`? Put DOM-free logic in `@plot/core` first, never
hand-port a core module into `apps/mobile/lib`, and read the rule in
`docs/agents/web-mobile-parity.md`. Nothing in CI enforces parity; it is a review-time check.

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
  Analytics only runs on the three production hosts — the allowlist in
  `apps/web/src/utils/analyticsHost.js` is duplicated in four surfaces that
  can't import it, so change all five together. Activation and the engagement
  tiers are PostHog cohorts, not events. See `docs/analytics/README.md` before
  adding an event or reading a number off a dashboard.

## CI sync-guards — regenerate, don't hand-patch one side

These checks fail the build if two sources drift. Fix by regenerating both, not editing one:

- `tokens:check` — `apps/web/src/styles/tokens.css` must match `@plot/core/tokens.js`
  (canonical colors/radii; also feeds mobile).
- `footer:check` · `changelog:check` · `tokens:marketing` · `emails:check` — shared
  footer / public changelog (`apps/website/data/changelog.json`) / website+email
  tokens / auth email templates.
- `csp:check` — the marketing site's Content-Security-Policy (`apps/website/_headers`
  and `apps/website/functions/_lib/csp.generated.js`) must match the inline
  `<script>` blocks in `apps/website/*.html`, which it admits by hash. There is no
  `'unsafe-inline'`: after editing an inline block run `pnpm run csp`; an inline
  `onclick=` or a new inline block in an Edge-Function-rendered page is blocked
  outright, so use `addEventListener` and a file under `apps/website/js/`.
- `migrations:check` — no migration may recreate a function with a different
  `ON CONFLICT` target without acknowledging it. See `docs/ops/migrations.md`.
- `copy:check` — no app file may hardcode a string that `packages/core/copy` owns.
- `core:check` — every `@plot/core/…` import must resolve to a file in this checkout.

Why worktrees must be siblings (and why `core:check` exists): `docs/ops/agent-worktrees.md`.

**Plot convention (source of truth):** agent worktrees are a **sibling** of this
repo, never nested inside it:

```
~/Developer/PLOT/                         ← this checkout
~/Developer/PLOT-worktrees/<YYYY-MM-DD-task> ← worktrees live here
```

The branch name is `agent/<YYYY-MM-DD-task>`. The folder name does not include the `agent/` prefix, because a slash would nest a directory. Cloud Cursor still uses `cursor/<name>-ff25`. Leave that prefix alone. The handoff note carries the human title.

From the main checkout root, prefer `pnpm run worktrees -- new <task>`. The manual form is:

```bash
mkdir -p ../PLOT-worktrees
git worktree add ../PLOT-worktrees/<YYYY-MM-DD-task> \
  -b agent/<YYYY-MM-DD-task> origin/main
```

A second agent may pick up a worktree only when `AGENT_HANDOFF.md` says `paused`, or the local lock is `active` and older than 12 hours with no new commit and a clean tree. Two writers at once are still forbidden. Delete `AGENT_HANDOFF.md` in the last commit before merge so it does not land on `main`. The local `.plot-session.json` stays gitignored. See `docs/ops/agent-worktrees.md`.

Never use `.claude/worktrees/` or `.worktrees/` under this checkout. If a harness
opens a nested worktree anyway, that is a **fallback only**: stop, tell the user,
and recreate under `../PLOT-worktrees/` before writing code. Do not keep working
nested and "just run `core:check`" unless the user explicitly insists, and never
for changes under `packages/core`. Procedure: `.agents/skills/plot-worktree/SKILL.md`
(Plot-owned; not overwritten by `npx skills update`). This section wins if
anything else disagrees.

## Copy lives in `packages/core/copy` — never retype a shared string

Every user-facing string that both apps show comes from `packages/core/copy`, and both
apps import it. `apps/web/src/copy/*` are re-export shims so web's existing import paths
still resolve; the strings themselves live in core.

`pnpm run copy:check` fails the build if an app file contains a literal the catalog already
owns. This exists because a hardcoded string that happens to match today is invisible drift:
it diverges the moment either side is reworded, which is exactly what the catalog was built
to prevent. The catalog being *shared* is necessary but not sufficient — it has to be *read*.

- Adding copy? Put it in the surface's module (`settingsView.js`, `mediaPanel.js`, …).
- Used on three or more surfaces? It belongs in `common.js`, or `media.js` for anything
  about a title (watch status, list actions). Those two are the designated cross-surface
  modules and may be imported from anywhere.
- **Never define the same string in two catalog modules.** That reintroduces the drift one
  level up. `onboardingFlow.startWatchingArrow` ("begin using Plot") and
  `media.startWatching` (the watch toggle) are deliberately different concepts that happen
  to share words — that's the one shape worth duplicating, and it's commented as such.
- Genuinely per-platform wording (mobile's compact labels, say) stays in the app file, but
  say why in a comment so the next person doesn't "fix" it into the catalog.
- `scripts/adopt-shared-copy.mjs` is a codemod that does the mechanical replacement when a
  new batch of copy moves into core. Run it with `--dry-run` first.

## Migrations and the database

- **Local dev has no database of its own.** `pnpm run dev` talks to the PLOT Staging
  Supabase project (see README "Local Setup"); there is nothing to migrate locally after a pull.
- **A migration merged to `main` applies to PRODUCTION automatically** via the Supabase
  GitHub integration. There is no staging gate: write it as if it runs immediately.
- **Before writing or reviewing anything under `supabase/migrations/` or `supabase/config.toml`,
  read `docs/ops/migrations.md`.** It holds the whole-body `create or replace function` trap,
  expand-then-contract, and the required `db:*` / `staging:test` checks.

## Testing expectations

- Add/adjust unit tests for domain logic in `packages/core` and `apps/web/tests/unit/`.
- Run `pnpm run check` and any test suite touching your change before calling it done.
- Mobile has no test runner — `tsc --noEmit` plus ESLint are the safety net; run both for
  mobile changes.
- Styling change to a shared shell class (`.cal-side`, `.hist-card`, `.cal-body`, anything
  in `app.css`)? Storybook's interaction tests assert behaviour and will not notice that a
  different page's spacing moved. There is no visual-diff service, so check the affected pages in
  the PR's Cloudflare preview before merging.
- Mobile lint is ratcheted: `no-explicit-any` (~127) and `react-hooks/refs` (~34) are `warn`,
  not `error`, because of a pre-existing backlog. Don't add new ones, and don't "fix" a
  warning count by widening the rule — burn them down instead. Everything else is an error
  and must stay at zero.
- No coverage thresholds; use judgment. Cover the logic that would silently break.

## Git & PRs

- Branch off `main`; don't commit to `main` directly.
- Keep changes scoped to the ticket — no unrelated refactors or file churn.
- Conventional-commit style prefixes (`feat(...)`, `fix(...)`, `refactor(...)`) as in history.

## Decisions

- Reversible + low-risk → decide, do it, mention it. Don't ask permission to proceed.
- Irreversible or user-facing (schema/data migrations, anything touching live users,
  public posts, deletes, deploys to prod config) → confirm first.
- If a ticket conflicts with this file, this file wins — flag the conflict.

## Who Savannah talks to

Savannah's main interface is her Grok bots (Chris, Jacob, Hailey, Alix, Kaia). Asked about the
day's order, the morning plan, or which bot should do something? Read
`docs/agents/bots-and-handoffs.md`.

### Keep work resumable

Save progress during the task, after each meaningful result or decision and before switching tasks. Do not wait for a token warning or the end of the day. A fresh chat cannot read another chat's memory, and a new Grok chat may share the same exhausted usage allowance.

Each active task needs one durable handoff outside the conversation, in its existing Notion task or Obsidian note. Keep that existing home rather than creating a second tracker, and link related records when both tools are used. Coding tasks use the worktree's `AGENT_HANDOFF.md`. Record the goal, owner, completed work with evidence links, exact next action, blockers, approvals already given and still needed, and the last updated time. Coding handoffs also record the branch, worktree, latest pushed commit, and checks passed or still pending. Keep credentials and unnecessary personal data out of these notes.

The Grok bots also save context in their own memory. That memory can help when Grok is available, but another agent must not assume it can read it. Save the progress, next action, and approval record needed to continue in Notion or Obsidian as well.

Chris keeps the active task list with a link to each handoff. Each bot updates its own task record directly; saving progress must not depend on Chris being available. If the shared record is unavailable, save a local handoff in the current worktree and tell Savannah where it is. Do not claim another bot has received instructions or that a shared document was updated unless that actually happened. These repo instructions apply to agents reading this file; configuring an external Grok bot to follow them is a separate step.

After a real coding change, update the handoff, inspect the diff for unrelated work and secrets, and commit and push a checkpoint with `[skip ci]` in the message. Stage only the task's files. Do not open a pull request solely for a checkpoint. A checkpoint may be unfinished; record that clearly. A finished pull request still needs the required checks without `[skip ci]`. Remove `AGENT_HANDOFF.md` before merge as described in `docs/ops/agent-worktrees.md`.

Picking up after a bot has already stopped? Follow "Recover when a bot has already stopped"
in `docs/agents/bots-and-handoffs.md`.

## How to explain the work

Savannah has no development background. Every reply, pull request, and `AGENT_HANDOFF.md` starts with what changed, why it matters, and what she needs to do, in everyday words. If a specialist word is required, the same sentence says what it does.

Then keep the exact record the next agent needs. The plain paragraph does not replace it.

Code, tests, names inside the code, and code comments stay at the current bar. Do not drop a check, skip a test, or blur a comment so the explanation is easier to write.

## Change only what the task needs

Touch only the files and fields the task needs. Do not tidy, rename, or widen a save while you are there.

A save sends only the fields that action is allowed to change. It does not send the row's ID, Premium, or billing fields to make "create or update" easier. If the row is missing, create it. If it exists, update the allowed fields. If two creates race, retry the safe update. This is how onboarding broke on 2026-10-14: the database correctly refused an update of `profiles.id`, and the old upsert was still sending that id. `packages/core/tests/unit/profileGrants.test.js` is the guard. Extend it when a client write targets a table whose columns are granted one by one. Do not grant a column just to make a failing save pass.

A new button or feature a person can use gets one PostHog event, named in `packages/core/analyticsEvents.js` and fired from the shared core path, so web and mobile count the same action once. Read `docs/analytics/README.md` before adding it. Do not invent a second activation event, and do not fire on a click that has not succeeded. If that save can fail, also send the existing `action_failed` event.

## Accounts and secrets

Do not ask Savannah to paste an API key, a token, or a password. Use the connector or plugin first. If it is missing, signed out, or has no access, read the value from the main checkout's `.env` (worktrees symlink it). Do not print it, commit it, or ask for it again. If neither the connector nor `.env` has it, start that connector's own login. That login screen is the only interruption.

Before reading or changing a connected product, check the account. Stop if it is a different person, repository, or project. Say which account you found. Do not switch by typing a key.

- GitHub user `savblack`, repository `savblack/PLOT` only.
- Mail and logins `sav.black@outlook.com` and `savannah@theplot.tv`.
- Supabase: `PLOT Staging` for ordinary work. Production only when she explicitly asked for production, and a write there still waits for a yes.
- PostHog: the private project named Plot.
- Linear: the `savblack` workspace, team PLO.

## Completion format & quality bar

When you finish, start with the plain-English paragraph from "How to explain the work". Then report in this shape:
1. **What changed** — one line per file/area, as clickable `path:line` links.
2. **How it was verified** — exact commands run and their result. If something failed or
   you skipped a step, say so plainly. Never claim "done" on unverified work.
3. **Follow-ups** — anything deferred or newly noticed, or "none."

Quality bar: it builds, `pnpm run check` passes, no new lint errors, no console noise, no
secrets added, no unrelated diffs. Design intent holds — flat monochrome (black/white/grey),
structure from hairlines and surface tokens, compact buttons never full-width. The accent
(`#E05578` on Light and Dark; its hue is per theme under Premium themes, the roles are
unchanged) is reserved for approved interaction and hierarchy cues: Save, favourite, delete,
logout, active tabs/indicators, focus and hover states, selected filters/providers,
progress/completion, calendar selection/today, list/profile/settings status, and featured or
chart hierarchy. It is not decorative. Image overlays may use a scrim for readability;
avoid decorative gradients or glows. Shadows only to keep an element legible against what's
behind it (`--shadow-overlay`), never on text. Full rules and canonical sources:
`docs/design/shared-design-system.md`. If you can't meet the bar, stop and say why rather
than shipping a guess.

## Cloud Agent environment

Running as a Cursor Cloud Agent, or changing `.cursor/environment.json` or its Dockerfile?
Read `docs/ops/cloud-agent-environment.md`.

## Marketing

- Reviewing/approving/publishing the week's posts & newsletter → follow `marketing/REVIEW.md`.
- Writing post copy → follow `marketing/copy/AGENT.md`.
- Tempted to rebuild a hosted marketing review UI? Read
  `docs/ops/retire-admin-review.md` and `docs/ops/operator-desk-shelved.md`
  first. Articles are reviewed in Notion (What's On Articles). Social posts are reviewed in Buffer. GitHub issues are the tracker. Linear article cards are off.

Model-agnostic runbooks: run from repo root on `main` with `.env` present, never a paid API
for copy, and **confirm before anything posts publicly.**

## Agent skills

Project skills live in `.agents/skills/`. Upstream pack: `michaelshimeles/skills`
(via `skills-lock.json`), minus `code-structure`, minus upstream
`new-feature` (Plot replaces isolate with a local skill), and minus
`greploop` and `greploop-apps`. Those two only talk to Greptile, which is off.
Do not add them back. Typical flow:

1. **Isolate** — `/plot-worktree`: sibling worktree at
   `~/Developer/PLOT-worktrees/<task>` (never nest under this checkout; nested harness
   trees are fallback-only, see CI sync-guards). Local skill; `npx skills update`
   does not touch it. Commands are also inlined under CI sync-guards above.
2. **Build** — follow this file (shared logic in `@plot/core`, not a generic
   actions/services split).
3. **Prove** — `/evidence-driven-testing` when the change needs runtime proof;
   always run the checks listed under Commands / Completion format.
4. **Ship** — open the PR, then work this checklist (skip items that do not
   apply; do not invent extra process):
   - [ ] Title and body through `/unslop`; body covers what changed, how
         verified, risks / follow-ups
   - [ ] `/before-and-after` only when there is a visible UI surface
   - [ ] For a permission change, a billing change, or a migration, ask a
         different agent you already use to read the diff before the pull
         request opens. Ordinary docs skip that.
5. **Write for humans** — `/unslop` on commit messages, PR title/body, and
   other prose you wrote (also: no em dashes in user-facing copy).

Do not merge the PR unless explicitly asked.

### Issue tracker

Issues live in this repo's GitHub Issues, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root, shared by every
workspace. See `docs/agents/domain.md`.
