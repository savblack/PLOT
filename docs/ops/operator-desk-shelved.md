# Operator Desk: shelved, not abandoned by accident

## What this is

`wip/operator-desk-checkpoint` (also `origin/plot-main`, commit `be55846`,
2026-07-03) contains a from-scratch replacement for `admin-review`: a
standalone Vite/React SPA at `control-desk/` ("PLOT Operator Desk"), three new
edge functions (`operator-api`, `operator-publish`, `operator-sync`), and a
richer data model — independent per-platform copy variants, a kanban queue, a
calendar view, and an append-only audit trail (`operator_approval_decisions`,
`operator_publish_attempts`) that `admin-review` still doesn't have.

It never merged. As of this writing it's 546 commits behind `main` and
predates the `apps/*`/`packages/*` monorepo restructure, so it can't be
rebased — reviving it would mean treating the branch as a design reference and
rebuilding the integration points fresh, not merging it.

## Why it wasn't merged

Evaluated in detail (August 2026) against extending `admin-review` in place.
Reasons it lost out, for the priorities that mattered at the time (pipeline
reliability, real engagement data, in-product observability):

- Its schema and sync design don't help with the two problems that had
  actually broken production (CLI flag drift in copy generation, the Sunday
  learning loop's hard-fail incident) — both live entirely outside anything
  Operator Desk touches.
- 3 of its 5 headline frontend features (queue, calendar, per-channel preview)
  are fully coded but were never wired into the app's navigation — reviving it
  means finishing real frontend work, not flipping a flag.
- Its `marketing_posts` ↔ `operator_posts` sync bridge is last-write-wins with
  no conflict detection: running both surfaces concurrently on the same post
  would silently clobber edits. Safe to adopt only with a hard, dated cutover
  (freeze the legacy surface for one week boundary), not a gradual rollout.
- `marketing/REVIEW.md` (the conversational twin used by the `marketing-week`
  skill) would need a full rewrite against the `operator-api` HTTP contract,
  not a find-and-replace — it currently anchors itself to `admin-review` as
  ground truth in three places.

## What's left behind in production

- **`operator_posts`, `operator_post_channel_variants`, `operator_post_media`,
  `operator_approval_decisions`, `operator_post_notes`,
  `operator_publish_attempts`, `operator_sync_links`,
  `operator_channel_accounts`** — all live in the database (migrations
  `20260629000000_operator_control_desk.sql`,
  `20260629001000_marketing_guide_post_type.sql`), all empty, all
  RLS-enabled/service-role-only, zero consuming code on `main`. Left in place
  deliberately: they're harmless as unused tables, and dropping them buys
  nothing if the design is ever revisited.
- **Vercel project `plot-control-desk`** (`prj_c5fESa0Tp7UogKSEWh7L7sSXs1Fj`) —
  linked but its deployment is disabled (`402 DEPLOYMENT_DISABLED` as of
  2026-08). Dormant, not exposed.

## If you revisit this

Read `control-desk/shared/model.mjs` and `supabase/functions/_shared/operator.ts`
at `be55846` first (`git show be55846:<path>`, not checked out anywhere) — the
data model and the audit-trail table shapes are the genuinely reusable parts.
Everything touching `admin-review` itself or `marketing/generate.mjs`'s status
values will need to be rebuilt against current `main`, not ported.
