The website’s labels above headings are removed. Homepage calls to action now remain only in the hero, mobile signup, independent developer section and footer. Savannah needs to approve merging before these changes go live.

# Remove website eyebrows

Owner: Alix / Codex
Status: ready for review, production approval pending
Branch: agent/2026-10-27-remove-website-eyebrows
Worktree: /Users/savannah/Developer/PLOT-worktrees/2026-10-27-remove-website-eyebrows
Updated: 2026-10-27T02:55:02.448453+00:00

Completed: removed eyebrow markup, unused copy entries and styles from homepage, pricing, taste match, About, Changelog and legal pages. Kept functional labels and Coming soon status. Legal body text unchanged.

Verification: pnpm 10.6.3 install --frozen-lockfile passed; pnpm run check passed using pinned pnpm on PATH; node --test apps/website/functions/_lib/*.test.js passed 83/83; node scripts/build-csp.mjs --check passed; git diff --check passed. Source scan has no eyebrow/page-label/vis-kicker/tm-kicker remnants. Local Wrangler preview on port 5213 visually checked homepage, Pricing and About at the in-app browser’s phone width. Desktop visual check pending.

Evidence: /tmp/plot-no-eyebrows-home.png and /tmp/plot-no-eyebrows-pricing.png. Check log: /tmp/plot-eyebrows-check.log. Website test log: /tmp/plot-eyebrows-website-tests.log.

Approvals: source change requested by Savannah. Merge and production publishing still need approval. No live data touched.

Next: review PR; after approval remove this handoff before merge, then merge and verify production.
Latest pushed code checkpoint: 36f1d91. Later handoff-only commits do not change the tested website source.

Environment: PLOT-main is a source snapshot without .git. Used real repository /Users/savannah/Developer/PLOT to create isolated sibling worktree. Global pnpm is 11; use /tmp/plot-pnpm10-bin/pnpm or pinned /Users/savannah/.cache/node/corepack/v1/pnpm/10.6.3/bin/pnpm.cjs. No dependency files changed.

## Homepage CTA follow-up

Savannah requested removing homepage CTAs except hero, mobile signup, independent section and footer. Removed account links from the homepage header, Memories, Drops, Import and Lists CTA blocks with their supporting notes, and Premium trial and comparison links. Kept Premium price information and standard site navigation. Removed empty grid action rows while preserving the mobile signup row at both breakpoints. Updated reference copy. Regenerated footer stylesheet URLs because the earlier eyebrow CSS change made their hashes stale; footer content is unchanged.

Verification: pnpm run check with pinned pnpm 10.6.3 passed; 83 website tests passed; footer and CSP sync checks passed; diff whitespace check passed. Desktop local browser accessibility tree confirms remaining actions only in permitted sections. Visually checked Premium without CTAs, retained mobile form, independent section and footer. Screenshot: /tmp/plot-homepage-ctas-removed.png. Logs: /tmp/plot-home-ctas-check.log and /tmp/plot-home-ctas-tests.log. Latest phone visual check applies to the earlier eyebrow change only; phone CTA visual check remains pending.

Review: https://github.com/savblack/PLOT/pull/1441. Source changes approved by request; merge and publishing still pending. Next: review the combined changes, remove this handoff before approved merge, then verify deployment. Check branch HEAD for latest pushed follow-up checkpoint.

Latest pushed CTA checkpoint: c79e41b.
