# tidy-design-doc

Status: paused
Owner: Claude Code (Impeccable session), for Savannah
Branch: agent/2026-11-21-tidy-design-doc
Worktree: ~/Developer/PLOT-worktrees/2026-11-21-tidy-design-doc
Latest pushed commit: 743dfcc2d (doc), plus this handoff update
Updated: 2026-11-21

## In plain words

I checked the design rules document (`docs/design/shared-design-system.md`) against the
real code and tidied it. It now opens with a one-screen summary of the rules that get
broken most often, shows dark-mode colors next to light ones, and lists every color the
app uses. I fixed five things that were out of date. No design rule was changed or
dropped. Savannah only needs to read it and say whether to open a pull request.

## Done

- Rewrote `docs/design/shared-design-system.md`. It's a docs-only change, no code.
- Fixed these mismatches with the code, found on 2026-11-21:
  - The links into `app.css` used line numbers that had gone stale (#L622 and #L1944; the
    rules are now at about 828 and 1703). Replaced with selector names.
  - The doc named a "bounce easing token", but no such token is in `tokens.css`.
    Replaced with `--ease`.
  - The doc said every card has a 20px radius. The app's `.panel-card` uses
    `--radius-md` (16px); only the website's `.card` is 20px. The doc now states both.
  - The color roles list was missing the status, success, rating, badge, image,
    artwork-fill, highlight and on-accent-secondary-fill tokens.
  - Prose said "plot"; it now says "Plot".
  - The foot bar description now covers the fold behavior from #1811.
- Verified: every `--token` and `.class` named in the doc exists in the code.

## Next

- Savannah: read the doc, then say whether to open a PR.
- Open question for Savannah: app cards are 16px and website cards are 20px. Which is
  intended? The doc records the current state; no code was changed.
- Before the PR: delete this file in the last commit. `pnpm run check` hasn't been run
  (docs-only change); run it before opening the PR.

## Approvals

- Given: tidy the existing doc, no new DESIGN.md (2026-11-21).
- Still needed: go-ahead to open a PR.
