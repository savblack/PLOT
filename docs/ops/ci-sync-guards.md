# CI sync-guards: regenerate, don't hand-patch one side

Moved out of `AGENTS.md`. Read this when a `*:check` fails, or before editing a
generated file or the source it is generated from.

These checks fail the build if two sources drift. Edit the source named on each line, then
run its regenerate command. Never hand-edit the generated side:

- `tokens:check` — `apps/web/src/styles/tokens.css` must match `@plot/core/tokens.js`
  (canonical colors/radii; also feeds mobile). Edit `tokens.js`, run `pnpm run tokens:build`.
- `footer:check` — the marketing-site footer in every `apps/website/*.html`. Edit
  `apps/website/_partials/footer.{html,css}`, run `pnpm run footer`.
- `changelog:check` — `apps/website/changelog.html` and `apps/website/copy/changelog.js`.
  Edit `apps/website/data/changelog.json` (or `pnpm run changelog:add`), run `pnpm run changelog`.
- `emails:check` — `supabase/templates/*.html`. Edit `scripts/push-auth-emails.mjs`, run
  `node scripts/push-auth-emails.mjs --render`.
- `tokens:marketing` — read-only check that `apps/website/theme.css` and
  `marketing/templates/base.css` match `@plot/core/tokens.js`. No generator: fix those two by hand.
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
  Why it exists alongside `tsc`, and why worktrees must be siblings: `docs/ops/agent-worktrees.md`.
