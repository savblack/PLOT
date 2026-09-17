# Fonts

Gabarito (display — page titles, section headings, the wordmark, rank numbers) and
DM Sans (body, controls, dense UI), both SIL Open Font License — see `OFL.txt`. This
directory is the source of truth; `apps/website/fonts/` holds byte-identical copies
because the marketing site deploys separately, and `apps/mobile/assets/fonts/` holds
the static TTFs Expo bundles.

Instrument Serif was retired on 16 Sep 2026. No Instrument Serif binary ships anywhere
in the repo, and there is no `--font-serif` token: display type is `var(--font-display)`
everywhere. One mention of the old name survives on purpose:
`marketing/templates/base.css` keeps a `--font-serif: var(--font-display)` legacy alias.

`apps/website/fonts/` carries **only the `.woff2` files**. Everything served from
`theplot.tv/fonts/` is fetched by a browser — the site's own pages and the `title-page`
/ `marketing-feed` edge functions — and the non-browser consumers listed below all read
from this directory instead. Copying the TTFs back there would ship nothing requests.

## Why both .woff2 and .ttf

They are not duplicates — different consumers need different formats.

- **`.woff2` — everything a browser loads.** Every `@font-face` and `<link rel=preload>`
  across `apps/web`, `apps/website`, the repo-root Pages Functions and the
  `title-page` / `marketing-feed` edge functions. WOFF2 is Brotli-compressed and
  font-aware, so it beats the raw TTF even after Cloudflare compresses it in transit
  (DM Sans: ~107 KB on the wire as TTF, ~87 KB as WOFF2).
- **`.ttf` — everything that is not a browser.** Keep these:
  - `Gabarito-Bold.ttf`, `DMSans-Regular.ttf`, `DMSans-Medium.ttf` are fetched at
    runtime by the OG image Worker (`apps/web/workers/og/`); Satori parses TTF/OTF
    and cannot read WOFF2.
  - `Gabarito-Bold.ttf` and `DMSans-Variable.ttf` are read off disk and inlined as
    data URIs by `scripts/generate-og-image.mjs`.
  - `Gabarito-Bold.ttf` is also read off disk by `marketing/lib/render.mjs`.

Deleting a `.ttf` silently degrades OG cards to a fallback face rather than failing a
build, so check all three consumers above before removing one.

## The tabular-digit face

`DMSans-TabularDigits.woff2` is a digits-only derivative in which all ten digits share
the `0` advance, built by `scripts/build-tabular-digits.py`. DM Sans ships no `tnum`
feature and spaces digits proportionally, so `font-variant-numeric: tabular-nums` does
nothing in it — the digits have to be respaced instead.

It is declared with `unicode-range: U+0030-0039`, so it supplies digits and nothing else;
letters still come from the real font. Use it through `--font-sans-tabular` on anything
that stacks numbers in a column or counts in place (ranks, day numbers, schedule times,
counters) — not on running text, where proportional digits read better. Rebuild with:

```bash
python3 scripts/build-tabular-digits.py
```

The same script also builds two **full-coverage** cuts into `apps/mobile/assets/fonts/`
— `DMSans-TabularRegular.ttf` and `DMSans-TabularSemiBold.ttf`. React Native has no
`unicode-range` and a `Text` takes exactly one family, so a digits-only file there would
leave every other character to the platform's fallback. Reach for them via
`fontFamily.sansTabular` / `sansTabularBold` in `apps/mobile/lib/tokens.ts`.

Those full cuts also drop the `kern` feature. Uniform advances alone are not enough:
DM Sans kerns digit pairs, so `1234567890` renders narrower than `0000000000` and the
column drifts again. The web face avoids this for free, because subsetting to digits
discards GPOS wholesale. `mark`/`mkmk` are kept so accents still position.

The script verifies that the ten digits share an advance at every corner of the
designspace, that the web face carries the digits and nothing else, and that the mobile
cuts lose no glyph the source had — and refuses to write a font that fails. It pins
`head.modified` from the source, so rebuilding unchanged fonts is byte-identical rather
than churning the binaries.

## Regenerating the .woff2 files

`DMSans-Variable.woff2` is the only one built from a `.ttf` in this directory. Straight
format conversion — no subsetting, so every glyph in the TTF survives. That matters:
TMDB titles carry accented and non-Latin characters, and a Latin-only subset would
render them in a fallback face.

```bash
python3 -c "
from fontTools.ttLib import TTFont
f = TTFont('DMSans-Variable.ttf'); f.flavor = 'woff2'; f.save('DMSans-Variable.woff2')
"
```

Then copy it to `apps/website/fonts/` so the two sites stay in sync.

`Gabarito-Variable.woff2` has no `.ttf` counterpart here — the only Gabarito TTF is the
static `Gabarito-Bold.ttf` the OG paths need — so it is not regenerated from this
directory. `DMSans-TabularDigits.woff2` is built by the script above, not by hand.
