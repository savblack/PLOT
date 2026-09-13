#!/usr/bin/env python3
"""Build the tabular-digit companion faces used by --font-sans-tabular / --font-serif-tabular.

Neither DM Sans nor Instrument Serif ships a `tnum` feature, and both draw digits at
proportional widths (DM Sans: '1' is 342 units against '0' at 656). That makes any column
of numbers ragged and makes an in-place counter shift sideways as it ticks over. Since the
feature isn't in the font, `font-variant-numeric: tabular-nums` cannot fix it — the digits
themselves have to be respaced.

This produces a digits-only face per family in which every digit shares the '0' advance and
sits centred within it. Loaded via `unicode-range: U+0030-0039`, it supplies only the digits;
every other character still comes from the real font, so the text is untouched.

Both upstreams are OFL with no Reserved Font Name, so a renamed derivative is permitted;
`OFL.txt` ships alongside and the derived faces are renamed to avoid being mistaken for
upstream. See apps/web/public/fonts/README.md.

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

DIGITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"]
DIGIT_UNICODES = "U+0030-0039"

# (source file, output stem, family name written into the face)
TARGETS = [
    ("DMSans-Variable.ttf", "DMSans-TabularDigits", "DM Sans Tabular"),
    ("InstrumentSerif-Regular.ttf", "InstrumentSerif-TabularDigits", "Instrument Serif Tabular"),
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


def verify(path, source_path):
    """Assert the ten digits share an advance at every corner of the designspace."""
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
    missing = [d for d in range(0x30, 0x3A) if d not in out_cmap]
    extra = [c for c in out_cmap if not (0x30 <= c <= 0x39)]
    return failures, missing, extra, instances


def main():
    for src_name, out_stem, family in TARGETS:
        src = WEB_FONTS / src_name
        font = subset_to_digits(src)
        advance = uniform_advances(font)
        rename(font, family)

        out = WEB_FONTS / f"{out_stem}.woff2"
        font.flavor = "woff2"
        font.save(out)

        failures, missing, extra, instances = verify(out, src)
        status = "OK" if not (failures or missing or extra) else "FAILED"
        print(
            f"{out.name:<34} {out.stat().st_size:>6} bytes  "
            f"advance={advance}  instances checked={len(instances)}  [{status}]"
        )
        if missing:
            print(f"  missing digit codepoints: {missing}")
        if extra:
            print(f"  unexpected codepoints retained: {[hex(c) for c in extra]}")
        for inst, widths in failures:
            print(f"  ragged at {inst}: {widths}")
        if failures or missing or extra:
            return 1

        (SITE_FONTS / out.name).write_bytes(out.read_bytes())
        print(f"{'':<34} copied to apps/website/fonts/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
