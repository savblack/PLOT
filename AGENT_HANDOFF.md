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

- `apps/website/theme.css`: `html { font-size: 87.5%; }` (now 87.5% = 14px base, was 16px). Almost all
  site sizes are rem, so type and rem spacing shrink ~6% on every page.
- `apps/website/index.html`: `--box-gap` 24–48px -> 10–16px; `--box-inset` 16–36px -> 12–24px;
  phone gap/inset 20px/14px -> 10px/10px.
- `apps/website/index.html`: "Review, rate, remember" card collage 560px -> 440px wide (desktop and tablet); phone 90% -> 74% width, card text bumped so it stays ~9.7px.
- `apps/website/index.html`: "Bring your whole history" card 480px -> 400px wide; posters 4:5 (cropped) -> 2:3 (full poster, titles visible).
- Narrower content so there is more space left and right: homepage hero 1280 -> 1120px, section content 1180 -> 1040px, Premium block 1120 -> 1000px; pricing 1180 -> 1040px; support/taste-match 1144 -> 1000px; footer 1360 -> 1200px (regenerated with `pnpm run footer`, which also bumps the ui.css cache tag on every page and the footer copy in two Supabase functions: marketing-feed, title-page). Those two functions need a redeploy for their footer and menu to match; the Cloudflare title pages update on merge, the Supabase copies only on redeploy.
- `pnpm run edge:check` passed (39 functions), `footer:check` passed.
- Menu bar: the homepage's cream pill nav moved from index.html into shared `apps/website/nav.css`, so every static page gets it; shadow softened to `0 4px 14px -10px rgba(41,41,36,0.2)`. Pricing's light-on-dark nav overrides removed; Support/Taste Match black Sign up overrides removed (all pink now). Every menu now reads What's On, Pricing, Log in, Sign up (Support link dropped from two pages; it stays in the footer). Title pages (`title-page.css`, `supabase/functions/title-page`) and What's On (`supabase/functions/marketing-feed`) carry a `nav.topnav` copy of the pill and gained a Pricing link; title-page content moved down to clear the pill. Regenerated with `pnpm run title-renderer` and `pnpm run footer`.
- Title pages and What's On could not be previewed with real data locally (`/api/discover` returns 403); the title-page stylesheet was checked with the menu markup only.
- Checked at 1440px in `pnpm run dev:website`: box gaps measure 16px; pricing page renders; no console errors.
- `pnpm run tokens:marketing`, `pnpm run csp:check`, `pnpm run check`: all pass.

## Next

Savannah decides if the amount is right (could go smaller or bigger). Then open a PR,
check the Cloudflare preview on phone width, delete this file before merge.
