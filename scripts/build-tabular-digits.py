#!/usr/bin/env python3
"""Build the tabular-digit companion faces used by --font-sans-tabular.

DM Sans ships no `tnum` feature and draws digits at proportional widths ('1' is 342 units
against '0' at 656). That makes any column of numbers ragged and makes an in-place counter
shift sideways as it ticks over. Since the feature isn't in the font,
`font-variant-numeric: tabular-nums` cannot fix it — the digits themselves have to be
respaced.

This produces a digits-only face in which every digit shares the '0' advance and sits
centred within it. Loaded via `unicode-range: U+0030-0039`, it supplies only the digits;
every other character still comes from the real font, so the text is untouched.

DM Sans is OFL with no Reserved Font Name, so a renamed derivative is permitted; `OFL.txt`
ships alongside and the derived faces are renamed to avoid being mistaken for upstream.
See apps/web/public/fonts/README.md.

Usage: python3 scripts/build-tabular-digits.py
Requires: fonttools[woff2]  (pip install 'fonttools[woff2]')
"""

import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

REPO = pathlib.Path(__file__).resolve().parent.parent
WEB_FONTS = REPO / "apps" / "web" / "public" / "fonts"
SITE_FONTS = REPO / "apps" / "website" / "fonts"
MOBILE_FONTS = REPO / "apps" / "mobile" / "assets" / "fonts"

DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
DIGIT_UNICODES = "U+0030-0039"

# Web: digits-only WOFF2, attached with `unicode-range: U+0030-0039` so the face
# supplies digits and the real font still draws every letter.
# (source file, output stem, family name written into the face)
WEB_TARGETS = [
    ("DMSans-Variable.ttf", "DMSans-TabularDigits", "DM Sans Tabular"),
]

# Mobile: React Native has no `unicode-range`, and a Text gets exactly one family —
# a digits-only face would leave every other character to the platform's fallback.
# So these keep full coverage and only the digits are respaced. Built from the static
# TTFs Expo already bundles, which carry no `gvar`/`HVAR`, so it is a plain metrics edit.
MOBILE_TARGETS = [
    ("DMSans-Regular.ttf", "DMSans-TabularRegular", "DM Sans Tabular"),
    ("DMSans-SemiBold.ttf", "DMSans-TabularSemiBold", "DM Sans Tabular SemiBold"),
]


def subset_to_digits(path):
    """Cut the font down to the ten digits, keeping variation tables intact."""
    font = TTFont(path)
    opts = subset.Options()
    opts.layout_features = []  # no shaping features survive; digits need none
    opts.name_IDs = "*"
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.recalc_bounds = True
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=range(0x30, 0x3A))
    subsetter.subset(font)
    return font


def drop_kerning(font, source_cmap):
    """Strip the `kern` feature while keeping every glyph.

    Uniform advances are not enough on their own: DM Sans kerns digit pairs, so
    '1234567890' comes out narrower than '0000000000' and a column drifts again. The web
    face dodges this because subsetting to digits discards GPOS wholesale; these full
    cuts have to drop it deliberately. Tabular figures are conventionally unkerned, and
    this family exists only for numeric UI here, so losing kern costs nothing.
    `mark`/`mkmk` are kept so accented characters still position correctly.
    """
    opts = subset.Options()
    opts.layout_features = [f for f in opts.layout_features if f != "kern"]
    opts.name_IDs = "*"
    opts.name_legacy = True
    opts.notdef_outline = True
    opts.recalc_bounds = True
    subsetter = subset.Subsetter(options=opts)
    subsetter.populate(unicodes=list(source_cmap))
    subsetter.subset(font)
    return font


def uniform_advances(font):
    """Give every digit the '0' advance and centre its outline inside it.

    Three things decide a digit's advance in a variable font, so all three are aligned:
      * `hmtx`      — the advance at the default instance;
      * `HVAR`      — how that advance varies across the designspace (what browsers use);
      * `gvar`      — phantom-point deltas, the fallback when there is no HVAR.
    Pointing every digit at '0' rather than freezing one number keeps the natural growth in
    width as weight increases, while guaranteeing the ten digits always agree with each other.
    """
    hmtx, glyf = font["hmtx"], font["glyf"]
    target_advance = hmtx["zero"][0]

    # HVAR: every digit reuses '0's advance-variation index.
    if "HVAR" in font:
        adv_map = font["HVAR"].table.AdvWidthMap
        if adv_map is not None:
            zero_idx = adv_map.mapping["zero"]
            for name in DIGITS:
                adv_map.mapping[name] = zero_idx

    # gvar: drop per-digit phantom-point movement so it can never reintroduce a difference.
    if "gvar" in font:
        for name in DIGITS:
            for tuple_var in font["gvar"].variations.get(name, []):
                coords = tuple_var.coordinates
                for i in range(-4, 0):
                    if coords[i] is not None:
                        coords[i] = (0, 0)

    # hmtx + outlines: centre each digit in the shared advance.
    for name in DIGITS:
        glyph = glyf[name]
        if glyph.numberOfContours == 0:
            hmtx[name] = (target_advance, 0)
            continue
        glyph.recalcBounds(glyf)
        ink_width = glyph.xMax - glyph.xMin
        desired_lsb = round((target_advance - ink_width) / 2)
        shift = desired_lsb - glyph.xMin
        if shift:
            for i in range(len(glyph.coordinates)):
                x, y = glyph.coordinates[i]
                glyph.coordinates[i] = (x + shift, y)
            glyph.recalcBounds(glyf)
        hmtx[name] = (target_advance, glyph.xMin)

    return target_advance


def rename(font, family):
    """Rename so the derivative is never mistaken for the upstream font."""
    for record in font["name"].names:
        if record.nameID in (1, 3, 4, 6, 16):
            text = family if record.nameID != 6 else family.replace(" ", "")
            if record.nameID == 3:
                text = f"{family}; derived from {record.toUnicode()}"
            record.string = text


def verify(path, source_path, digits_only=True):
    """Assert the ten digits share an advance at every corner of the designspace.

    `digits_only` also asserts the coverage contract: the web faces must carry the ten
    digits and nothing else, the mobile ones must keep every glyph the source had.
    """
    font = TTFont(path)
    axes = {a.axisTag: (a.minValue, a.maxValue) for a in font["fvar"].axes} if "fvar" in font else {}
    instances = [{}]
    if "wght" in axes:
        lo, hi = axes["wght"]
        instances = [{"wght": w} for w in (lo, 300, 400, 500, 600, 700, hi) if lo <= w <= hi]
        if "opsz" in axes:
            o_lo, o_hi = axes["opsz"]
            instances = [
                {**inst, "opsz": o} for inst in instances for o in (o_lo, 14, o_hi)
            ]

    failures = []
    for inst in instances:
        probe = TTFont(path)
        if inst:
            probe = instancer.instantiateVariableFont(probe, inst, inplace=False)
        widths = {d: probe["hmtx"][d][0] for d in DIGITS}
        if len(set(widths.values())) != 1:
            failures.append((inst, widths))

    src_cmap = TTFont(source_path).getBestCmap()
    out_cmap = font.getBestCmap()
    if digits_only:
        missing = [hex(d) for d in range(0x30, 0x3A) if d not in out_cmap]
        extra = [hex(c) for c in out_cmap if not (0x30 <= c <= 0x39)]
    else:
        # Full coverage: nothing the source could draw may have been lost.
        missing = [hex(c) for c in src_cmap if c not in out_cmap]
        extra = []
    return failures, missing, extra, instances


def build(src, out, family, digits_only):
    """Respace the digits of `src` into `out`, then prove the result."""
    if digits_only:
        font = subset_to_digits(src)
    else:
        font = TTFont(src)
        font = drop_kerning(font, TTFont(src).getBestCmap())
    advance = uniform_advances(font)
    rename(font, family)
    # Keep the source's head.modified instead of stamping "now", so rebuilding an
    # unchanged font is byte-identical and doesn't churn five binaries in the diff.
    font.recalcTimestamp = False
    font["head"].modified = TTFont(src)["head"].modified
    font.flavor = "woff2" if out.suffix == ".woff2" else None
    font.save(out)

    failures, missing, extra, instances = verify(out, src, digits_only=digits_only)
    ok = not (failures or missing or extra)
    print(
        f"{out.name:<32} {out.stat().st_size:>7} bytes  advance={advance:<5} "
        f"instances={len(instances):<3} [{'OK' if ok else 'FAILED'}]"
    )
    if missing:
        print(f"  glyphs lost: {missing[:12]}{' …' if len(missing) > 12 else ''}")
    if extra:
        print(f"  unexpected codepoints kept: {extra[:12]}")
    for inst, widths in failures:
        print(f"  ragged at {inst}: {widths}")
    return ok


def main():
    print("web — digits only, attached by unicode-range")
    for src_name, out_stem, family in WEB_TARGETS:
        out = WEB_FONTS / f"{out_stem}.woff2"
        if not build(WEB_FONTS / src_name, out, family, digits_only=True):
            return 1
        (SITE_FONTS / out.name).write_bytes(out.read_bytes())
        print(f"{'':<32} copied to apps/website/fonts/")

    print("\nmobile — full coverage, one family per Text")
    for src_name, out_stem, family in MOBILE_TARGETS:
        if not build(MOBILE_FONTS / src_name, MOBILE_FONTS / f"{out_stem}.ttf", family, digits_only=False):
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
