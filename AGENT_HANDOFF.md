# website-compact

Status: paused (waiting on Savannah's review)
Owner: Jacob (website)
Branch: agent/2026-11-13-website-compact
Worktree: ~/Developer/PLOT-worktrees/2026-11-13-website-compact
Updated: 2026-11-13

## Plain summary

The marketing site (theplot.tv) is a touch smaller everywhere and the homepage's
rounded boxes sit much closer together. Nothing is live yet. Savannah reviews it,
then a pull request can open.

## Done

- `apps/website/theme.css`: `html { font-size: 93.75%; }` (15px base, was 16px). Almost all
  site sizes are rem, so type and rem spacing shrink ~6% on every page.
- `apps/website/index.html`: `--box-gap` 24–48px -> 10–16px; `--box-inset` 16–36px -> 12–24px;
  phone gap/inset 20px/14px -> 10px/10px.
- `apps/website/index.html`: "Review, rate, remember" card collage 560px -> 440px wide (desktop and tablet); phone 90% -> 74% width, card text bumped so it stays ~9.7px.
- `apps/website/index.html`: "Bring your whole history" card 480px -> 400px wide; posters 4:5 (cropped) -> 2:3 (full poster, titles visible).
- Checked at 1440px in `pnpm run dev:website`: box gaps measure 16px; pricing page renders; no console errors.
- `pnpm run tokens:marketing`, `pnpm run csp:check`, `pnpm run check`: all pass.

## Next

Savannah decides if the amount is right (could go smaller or bigger). Then open a PR,
check the Cloudflare preview on phone width, delete this file before merge.
