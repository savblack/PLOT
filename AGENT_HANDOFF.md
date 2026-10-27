The website’s small labels above headings are removed so the headings stand on their own. Savannah needs to approve merging before the change goes live.

# Remove website eyebrows

Owner: Alix / Codex
Status: ready for review, production approval pending
Branch: agent/2026-10-27-remove-website-eyebrows
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-remove-website-eyebrows
Updated: 2026-10-27T02:50:25.522021+00:00

Completed: removed eyebrow markup, unused copy entries and styles from homepage, pricing, taste match, About, Changelog and legal pages. Kept functional labels and Coming soon status. Legal body text unchanged.

Verification: pnpm 10.6.3 install --frozen-lockfile passed; pnpm run check passed using pinned pnpm on PATH; node --test apps/website/functions/_lib/*.test.js passed 83/83; node scripts/build-csp.mjs --check passed; git diff --check passed. Source scan has no eyebrow/page-label/vis-kicker/tm-kicker remnants. Local Wrangler preview on port 5213 visually checked homepage, Pricing and About at the in-app browser’s phone width. Desktop visual check pending.

Evidence: /tmp/plot-no-eyebrows-home.png and /tmp/plot-no-eyebrows-pricing.png. Check log: /tmp/plot-eyebrows-check.log. Website test log: /tmp/plot-eyebrows-website-tests.log.

Approvals: source change requested by Savannah. Merge and production publishing still need approval. No live data touched.

Next: review PR; after approval remove this handoff before merge, then merge and verify production.
Latest pushed code checkpoint: 36f1d91. Later handoff-only commits do not change the tested website source.

Environment: PLOT-main is a source snapshot without .git. Used real repository /Users/savannah/Developer/PLOT to create isolated sibling worktree. Global pnpm is 11; use /tmp/plot-pnpm10-bin/pnpm or pinned /Users/savannah/.cache/node/corepack/v1/pnpm/10.6.3/bin/pnpm.cjs. No dependency files changed.
