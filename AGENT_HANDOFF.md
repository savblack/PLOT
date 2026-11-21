# Handoff: Progress menu Watched, folding foot bar, Watch Together circle, New Releases icon

Status: paused (finished; waiting for Savannah to decide on a pull request)
Owner: Claude Code (desktop session), for Savannah
Last updated: 2026-11-21

## In plain words

Four small changes to the title page and nav, asked for one after another:

1. The Progress menu on a title has "Watched" again (Watching, Watched, Didn't finish, Clear status).
2. The "Watched it?" / "Thoughts?" bar at the bottom of a title starts folded to its head line and
   slides open once you scroll the title a little. Tapping the head line folds or opens it by hand,
   and that choice holds for the session.
3. The dashed circle with a plus (or "…") on the Watch Together invite card is gone.
4. New Releases in the nav uses an eight-ray burst icon instead of the clapperboard.

Savannah needs to: decide whether to open the pull request.

## Record

- Branch `agent/2026-11-21-progress-watched-footbar-collapse`, worktree
  `~/Developer/PLOT-worktrees/2026-11-21-progress-watched-footbar-collapse`.
- Core: `packages/core/useTitleFootBar.js` (`folded`, `toggleFolded`, `revealed`,
  `beforeFoldChange`, `FOOT_BAR_REVEAL_SCROLL`), copy in `copy/mediaPanel.js`,
  event `TITLE_FOOT_BAR_FOLDED` (documented in `docs/analytics/README.md`).
- Web: `TitleFootBar.jsx/.css` (scroll ancestor watch, grid-rows slide), `MediaPanel.jsx`,
  `WatchTogetherHub.jsx/.css`, `navIcons.jsx`.
- Mobile: `TitleFootBar.tsx` (LayoutAnimation, Reduce Motion respected), `MediaPanel.tsx`
  (scroll / short-content reveal), `watch/WatchHub.tsx`, `NavIcons.tsx`, story.
- Checks: `pnpm run check` exit 0; `pnpm run test:unit` 2314 pass / 0 fail; mobile ESLint warning
  count unchanged (35 in MediaPanel.tsx before and after).
- Seen in Storybook (web): foot bar folded on mount, opens itself, folds by hand; sidebar icon.
- Not verified: the real title panel signed in (no Staging test login); the iPhone app.
- Approvals still needed: opening the PR. Delete this file in the last commit before merge.
