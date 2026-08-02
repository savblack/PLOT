# apps/website

The theplot.tv marketing site: static HTML pages, deployed as-is (no build step). Stays that way intentionally.

## Storybook (documentation only)

```
npm run storybook:website
```

This is a read-only visual reference for the site's shared patterns (tokens, buttons, nav, footer) — it does not build, bundle, or affect the deployed site in any way. Stories live in `stories/` and import directly from the real files (`theme.css`, `nav.css`, `_partials/footer.html`) wherever possible, so they can't silently drift from what's live.

Two things aren't in a shared file yet and are mirrored by hand in `stories/*.mirror.css` — each page currently carries its own inline `<style>` copy:

- Button rules (`.btn`, `.btn-primary`, `.btn-outline`, `.btn-outline-white`)
- Footer rules (`footer`, `.footer-*`)

If you change these in a page's `<style>` block, update the matching mirror file too, or the Storybook docs will drift from the real site.
