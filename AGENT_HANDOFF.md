# Handoff: skip the repeat /save preview from title pages

**Plain summary.** People who click "Save to your plot" on a movie page used to land on a second page showing the same title again, then had to click once more to reach signup. In 45 days 47 people clicked Save, 5 reached the signup form, 3 signed up. This change sends them straight to signup (or sign-in on a browser that already has an account). Newsletter, chart and shared-link visitors still see the preview.

- Owner: Claude Code for Savannah. Status: code done and pushed (commit 5691214b0); no PR opened.
- Branch/worktree: agent/2026-11-03-skip-save-preview, ~/Developer/PLOT-worktrees/2026-11-03-skip-save-preview, based on origin/main ddc1b120e (local copy, fetch failed).
- Changed: apps/web/src/pages/SavePage.jsx, apps/web/src/utils/pendingSave.js (skipsSavePreview), apps/web/tests/unit/pendingSave.test.js.
- Checks: pendingSave unit tests pass (27/27); pnpm run check passes. Not run: smoke test, manual browser check of the flow.
- Next: open PR (title/body via /unslop), then compare title_page save_cta_clicked -> signup_form_viewed over 2 weeks (baseline 5 of 47).
- Approvals: none needed yet. Merge needs Savannah's OK.
- Last updated: 2026-11-03
