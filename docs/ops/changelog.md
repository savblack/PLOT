# Public product changelog

PLOT keeps a public, dated changelog at [theplot.tv/changelog](https://theplot.tv/changelog).

This is the process for every public ship. The page itself is static HTML in
`apps/website/changelog.html` (no build step).

## When to write an entry

Same day as the public ship. If it is visible to members (or Comp Watch), it
belongs on the changelog. Internal-only refactors do not.

## Entry shape

Newest first. Each entry has:

1. **Version** — calendar `YYYY.M.D` for web ships until the App Store line has
   its own store version. When a mobile build ships with a store version, use
   that (`1.0.1`) and keep the date beside it.
2. **Date** — human label plus an ISO `datetime` on `<time>`.
3. **Buckets** — only the ones that apply:
   - **New** — something members can do or see that they could not before
   - **Improved** — existing behaviour that got clearer, faster, or kinder
   - **Fixed** — a bug that is gone

Write in plain user language. No ticket IDs, no PR numbers, no eng jargon.

## Checklist

1. Add a new `<article class="changelog-entry" id="VERSION">` at the top of the
   entry list in `apps/website/changelog.html`.
2. Mirror the same strings in `apps/website/copy/changelog.js` (Storybook
   Content catalog).
3. Keep the footer link (`/changelog` in `_partials/footer.html`). Run
   `pnpm run footer` only if you touched the partial.
4. Leave a note for Competitor Watch / Comp Watch when a ship is worth
   tracking externally (own-product URL is already `https://theplot.tv/changelog`).

## Out of scope here

- In-app "What's new" sheet after update
- RSS / Atom feed

Those are follow-ups on PLO-471, not part of the MVP page.
