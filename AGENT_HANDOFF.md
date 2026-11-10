# traffic-banner

**In plain words:** A temporary notice now shows at the top of every marketing site page and every signed-in page of the web app. It says Plot is seeing more traffic than usual and that importing watch history or saving titles may misbehave while systems are upgraded. Nothing is live until the pull request is merged; merging is Savannah's call.

Status: paused (pull request open, waiting for Savannah's review and merge)
Owner: Jacob (website and web app)
Branch: agent/2026-11-10-traffic-banner
Worktree: ~/Developer/PLOT-worktrees/2026-11-10-traffic-banner
Updated: 2026-11-10 (CI fix: notice is role="note"; role="status" collided with two smoke tests)

## Goal

Savannah asked for a banner at the top of the website and the app about higher traffic and possible issues importing watch history or saving titles.

## Done

- Sentence: `APP_SHELL.serviceNotice` in `packages/core/copy/appShell.js`. The no-build marketing site carries the same sentence in `apps/website/js/site-notice.js` (reference copy in `apps/website/copy/common.js`). Change both together.
- Web app: `apps/web/src/components/ServiceNotice.jsx` + `.css`, rendered first in `.app-main-inner` in `AppShell.jsx`. In flow, no dismiss button, so no analytics event.
- Website: `js/site-notice.js` is loaded from `_partials/footer.html`, so every page with the shared footer gets it (static pages, /whats-on, title pages). It inserts a strip at the top of the body and pushes the fixed nav down by the visible part (`--site-notice-offset`). `index.html`'s phone menu panel uses the same offset. `pnpm run footer` regenerated the pages and the three generated footer modules.

## Checks

- `pnpm run check`: pass. `footer:check`, `csp:check`, `copy:check`, `core:check`, `colors:check`: pass.
- Website previewed locally (home desktop and phone, phone menu open, pricing): banner shows, nav clears it, no console errors.
- Web app: the signed-in shell was not seen on screen (needs a login). The component's styling was checked by rendering it on the dev design-system page.

## Not done / decisions

- Mobile app does not render the notice (not shipped yet). The sentence is in core if it is wanted there.
- Login, signup and onboarding screens do not show it (they sit outside the app shell).
- `apps/website/404.html` has no shared footer, so no banner there.
- /whats-on and title pages pick it up when the Supabase functions redeploy after merge.

## To take it down

Set `serviceNotice` to `''` (or revert the pull request): delete `apps/website/js/site-notice.js` and its script line in `_partials/footer.html`, run `pnpm run footer`, remove `ServiceNotice` from `AppShell.jsx`.

## Approvals

- Given: build the banner.
- Still needed: merge to main (deploys to production).
