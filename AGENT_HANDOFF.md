# edit-profile-shared-controls

Status: active
Branch: agent/2026-11-17-edit-profile-shared-controls
Updated: 2026-11-17T11:00:00.000Z

## In plain words

The Edit profile pop-up on web had two buttons drawn just for it: the pink
"Change photo" link and the "…" button inside the Display name and Username
boxes. They now use the same shared button styles as the rest of the app, so a
future change to those styles reaches this pop-up too. Cancel and Save were
already shared. Savannah needs to look at the pop-up once and say if she is happy
with how "Change photo" now looks (a small cream pill instead of pink text).

This is an unfinished checkpoint. See Checks.

- Goal: every button in the web Edit profile pop-up uses a shared component or class.
- Owner: Claude Code session, asked for by Savannah on 2026-11-17 (Jacob's area: web app).
- Worktree: `~/Developer/PLOT-worktrees/2026-11-17-edit-profile-shared-controls`

## Done

`apps/web/src/pages/PublicProfilePage.jsx` only:

- "Change photo" is `btn btn-secondary btn-sm` (was `.pp-photo-btn`, removed).
- The per-field edit button is the shared `.icon-btn`; `.pp-input-edit-btn` now
  only positions it inside the input.
- The check icon in that button is the shared `Icon name="check"`. The three dots
  stay local because `@plot/core/icons.js` has no "more" icon; the fill moved onto
  each dot because `.icon-btn svg` sets `fill: none`.

## Left as is, on purpose

- Text inputs, the bio box, field labels and the section checkboxes. The web app
  has no shared input, label or switch component yet (each dialog has its own:
  `.smart-input`, `.pp-input`, …). Building one is a separate, larger task.
- `.pp-avatar` (84px). The design system page documents it as the profile size.
- Mobile. This pop-up's web file is the only one touched.

## Checks

- [x] `pnpm run check` (0 errors, 168 warnings; the count was not compared with `main`)
- [x] `pnpm run test:unit` (all pass, 0 fail)
- [x] The new button markup drawn with the app's real styles on localhost: cream pill sized to its label, 34px icon button inside the input, solid dots, tick.
- [ ] The real pop-up opened while signed in (the agent cannot sign in; check the pull request's Cloudflare preview)

## Next

Pull request is open. Look at the real pop-up signed in on its Cloudflare preview. Delete this file in the last commit before merge.

## Approvals

- Given: Savannah asked for the pop-up to use the shared components.
- Still needed: her OK on the new look of "Change photo"; her OK to merge.
