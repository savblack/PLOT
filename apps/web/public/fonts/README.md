# Fonts

Instrument Serif (brand, editorial headings) and DM Sans (body, controls, dense UI),
both SIL Open Font License — see `OFL.txt`. This directory is the source of truth;
`apps/website/fonts/` holds byte-identical copies because the marketing site deploys
separately, and `apps/mobile/assets/fonts/` holds the static TTFs Expo bundles.

## Why both .woff2 and .ttf

They are not duplicates — different consumers need different formats.

- **`.woff2` — everything a browser loads.** Every `@font-face` and `<link rel=preload>`
  across `apps/web`, `apps/website`, the repo-root Pages Functions and the
  `title-page` / `marketing-feed` edge functions. WOFF2 is Brotli-compressed and
  font-aware, so it beats the raw TTF even after Cloudflare compresses it in transit
  (DM Sans: ~107 KB on the wire as TTF, ~87 KB as WOFF2).
- **`.ttf` — everything that is not a browser.** Keep these:
  - `DMSans-Regular.ttf`, `DMSans-Medium.ttf`, `InstrumentSerif-Regular.ttf` are fetched
    at runtime by the OG image Worker (`apps/web/workers/og/`); Satori parses TTF/OTF
    and cannot read WOFF2.
  - `DMSans-Variable.ttf`, `InstrumentSerif-Regular.ttf`, `InstrumentSerif-Italic.ttf`
    are read off disk and inlined as data URIs by `scripts/generate-og-image.mjs`.

Deleting a `.ttf` silently degrades OG cards to a fallback face rather than failing a
build, so check both consumers above before removing one.

## The tabular-digit faces

`DMSans-TabularDigits.woff2` and `InstrumentSerif-TabularDigits.woff2` are digits-only
derivatives in which all ten digits share the `0` advance, built by
`scripts/build-tabular-digits.py`. Neither upstream family ships a `tnum` feature and both
space digits proportionally, so `font-variant-numeric: tabular-nums` does nothing in them —
the digits have to be respaced instead.

They are declared with `unicode-range: U+0030-0039`, so they supply digits and nothing else;
letters still come from the real font. Use them through `--font-sans-tabular` /
`--font-serif-tabular` on anything that stacks numbers in a column or counts in place
(ranks, day numbers, schedule times, counters) — not on running text, where proportional
digits read better. Rebuild with:

```bash
python3 scripts/build-tabular-digits.py
```

The script verifies that the ten digits share an advance at every corner of the
designspace and refuses to write a font that fails, then copies to `apps/website/fonts/`.

## Regenerating the .woff2 files

Straight format conversion — no subsetting, so every glyph in the TTF survives. That
matters: TMDB titles carry accented and non-Latin characters, and a Latin-only subset
would render them in a fallback face.

```bash
python3 -c "
from fontTools.ttLib import TTFont
for n in ['DMSans-Variable','InstrumentSerif-Regular','InstrumentSerif-Italic']:
    f = TTFont(f'{n}.ttf'); f.flavor = 'woff2'; f.save(f'{n}.woff2')
"
```

Then copy the three `.woff2` files to `apps/website/fonts/` so the two sites stay in sync.

## A note on weights

Instrument Serif ships a **single 400 weight**. Asking for 600 or heavier makes the
browser synthesise a bold — it thickens every stroke uniformly, which flattens the
thick/thin contrast the face depends on. Keep serif rules at 400 or 500 (500 matches
400 exactly, with no synthesis) and use DM Sans, a true 100–1000 variable font, wherever
real bold is needed.
