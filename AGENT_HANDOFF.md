# 2026-11-18-compare-either-premium

Status: active
Branch: agent/2026-11-18-compare-either-premium
Owner: Claude Code (Hailey: Premium / Jacob: security review)
Updated: 2026-11-18

## Plain summary

Compare (taste overlap) now works when either person has Premium, like Watch
together. A Free member can compare with a Premium member. Two Free members
still see the upgrade card. Savannah asked for this on 2026-11-18.
This includes a database migration, which goes to production on merge, so
merging needs Savannah's yes.

## Done

- `supabase/migrations/20261118140000_taste_overlap_either_premium.sql`: Premium test moved below
  the target lookup and visibility checks; passes on is_premium(viewer) or is_premium(target).
  Diffed against the last definition (20261012150000): only that block moved/changed.
- Web `TasteOverlapPage.jsx` and mobile `TasteOverlapView.tsx` always call the RPC and show the
  upsell only on `premium_required` (`compareUnlocked` in `packages/core/tasteOverlap.js`).
- Copy: upsell body and the plans page Deeper stats description.
- Tests: unit test for compareUnlocked; `scripts/staging-taste-overlap-test.sql` extended.
- Passed: check, test:unit, mobile typecheck, migrations:check, migrations:contract,
  db:block-clause, staging:test -- taste-overlap (19 PASS).

## Not run

- db:function-diff and db:migration-test: no PLOT_PRODUCTION_DB_PASSWORD in .env.

## Next

- Second-agent review of the diff, then open the PR. Merge waits for Savannah.
