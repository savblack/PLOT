#!/usr/bin/env python3
"""Build the PLOT mark (the five-dot lowercase p) and the X covers that carry it.

Chosen 28 Sep 2026 on the logo canvas: five circles as a lowercase p, three down
the stem and two across the top, the bowl's inner dot in the fill pink. The group
is a locked unit centred in a 100 box, so it centres in any
square tile.

Outputs, all under marketing/assets/:
  mark/plot-mark-<colourway>.svg          the mark on a square ground (or none)
  mark/plot-mark-<colourway>-<size>.png   16 24 32 48 64 128 180 256 512 1024
  x-header-<ground>.svg / .png            1500x500, mark top-left, line bottom-right
  plot-avatar-<ground>.svg / .png         1080x1080 profile picture, mark centred and
                                          sized for the circle crop every platform applies
  plot-avatar-wordmark-<ground>.svg/.png  1080x1080 profile picture, the lowercase
                                          wordmark centred inside the same circle

Text is outlined from the Gabarito files in apps/web/public/fonts (Bold for the
wordmark, the variable face instanced at 400 for the sentence), so the SVGs need
no font installed. PNGs come from macOS qlmanage, the same as a Finder preview.

Run from anywhere:  python3 marketing/assets/build-mark.py
"""
from pathlib import Path
import subprocess, shutil, sys

from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FONTS = ROOT / 'apps/web/public/fonts'
OUT_MARK = HERE / 'mark'
OUT_MARK.mkdir(exist_ok=True)

# ── the mark ────────────────────────────────────────────────────────────────
# Dot centres in a 100 box. Stem at x=35 (y 20, 50, 80), bowl top at (65,20),
# bowl inner at (65,50) which is the pink one. Radius 13, so every dot has a
# 4-unit gap to its neighbours: the loose set, chosen over the touching one.
# Group spans 22-78 across and 7-93 down, centred on 50.
DOTS = [(35, 20), (35, 50), (35, 80), (65, 20)]
PINK_DOT = (65, 50)
R = 13

def mark_paths(ink, pink, scale=1.0, dx=0.0, dy=0.0):
    out = []
    for cx, cy in DOTS:
        out.append(f'<circle cx="{dx+cx*scale:.2f}" cy="{dy+cy*scale:.2f}" r="{R*scale:.2f}" fill="{ink}"/>')
    cx, cy = PINK_DOT
    out.append(f'<circle cx="{dx+cx*scale:.2f}" cy="{dy+cy*scale:.2f}" r="{R*scale:.2f}" fill="{pink}"/>')
    return ''.join(out)

# colourway: (ground or None, ink, pink)
MARK_COLOURWAYS = {
    'charcoal-on-cream':  ('#F8F2EA', '#292924', '#FF88C8'),
    'cream-on-charcoal':  ('#292924', '#F0EFE8', '#FF88C8'),
    'charcoal-on-pink':   ('#FF88C8', '#292924', '#FFFCF7'),
    'green-on-sage':      ('#DBE1B0', '#5F7030', '#FF88C8'),
    'charcoal':           (None, '#292924', '#FF88C8'),
    'cream':              (None, '#F0EFE8', '#FF88C8'),
}
SIZES = [16, 24, 32, 48, 64, 128, 180, 256, 512, 1024]

def mark_svg(ground, ink, pink):
    bg = f'<rect width="100" height="100" fill="{ground}"/>' if ground else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 100 100">'
            f'{bg}{mark_paths(ink, pink)}</svg>')

# ── text outlines ───────────────────────────────────────────────────────────
def load_bold():
    return TTFont(FONTS / 'Gabarito-Bold.ttf')

def load_weight(w):
    f = TTFont(FONTS / 'Gabarito-Variable.woff2')
    return instantiateVariableFont(f, {'wght': w})

def outline(font, text, size, tracking_em, x, baseline, fill):
    """SVG <path>s for `text` with its left edge at x and the given baseline.
    Returns (svg, advance_width_px)."""
    cmap = font.getBestCmap()
    glyphs = font.getGlyphSet()
    upm = font['head'].unitsPerEm
    s = size / upm
    hmtx = font['hmtx']
    pen_x = 0.0
    parts = []
    for ch in text:
        g = cmap.get(ord(ch))
        if g is None:
            continue
        adv = hmtx[g][0]
        if ch != ' ':
            p = SVGPathPen(glyphs)
            tp = TransformPen(p, (s, 0, 0, -s, x + pen_x * s, baseline))
            glyphs[g].draw(tp)
            d = p.getCommands()
            if d:
                parts.append(f'<path d="{d}" fill="{fill}"/>')
        pen_x += adv + tracking_em * upm
    return ''.join(parts), pen_x * s

def measure(font, text, size, tracking_em):
    return outline(font, text, size, tracking_em, 0, 0, '#000')[1]

# ── the cover ───────────────────────────────────────────────────────────────
W, H = 1500, 500
# ground: (bg, wordmark, sentence, dots ink, dot pink)
COVERS = {
    'cream':    ('#F8F2EA', '#292924', '#5F5A52', '#292924', '#FF88C8'),
    'charcoal': ('#292924', '#F0EFE8', '#C9D48A', '#F0EFE8', '#FF88C8'),
    'pink':     ('#FF88C8', '#292924', '#FFFCF7', '#292924', '#FFFCF7'),
    'sage':     ('#DBE1B0', '#292924', '#5F7030', '#5F7030', '#FF88C8'),
}
FONT_PX = 104
RIGHT = W - 80          # right edge of the line
BASELINE = 402          # keeps descenders clear of X's avatar zone (x < 260, y > 380)
MARK_BOX = 150          # top-left mark, box size; dots occupy the middle 60%
MARK_XY = (70, 62)

def cover_svg(bg, wm, sen, ink, pink, bold, regular):
    wm_w = measure(bold, 'plot', FONT_PX, -0.045)
    gap = FONT_PX * 0.22
    sen_w = measure(regular, 'what you watch.', FONT_PX, -0.02)
    start = RIGHT - (wm_w + gap + sen_w)
    wm_svg, _ = outline(bold, 'plot', FONT_PX, -0.045, start, BASELINE, wm)
    sen_svg, _ = outline(regular, 'what you watch.', FONT_PX, -0.02, start + wm_w + gap, BASELINE, sen)
    mark = mark_paths(ink, pink, scale=MARK_BOX / 100, dx=MARK_XY[0], dy=MARK_XY[1])
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
            f'<!-- plot X header: five-dot p top-left, "plot what you watch." bottom-right.\n'
            f'     Wordmark Gabarito 700, sentence Gabarito 400, both outlined. Built by build-mark.py. -->'
            f'<rect width="{W}" height="{H}" fill="{bg}"/>{mark}{wm_svg}{sen_svg}</svg>'), start

def to_png(svg_path: Path, png_path: Path, px: int):
    """qlmanage renders an SVG thumbnail at `px` on its longest side."""
    tmp = png_path.parent / '_ql'
    tmp.mkdir(exist_ok=True)
    subprocess.run(['qlmanage', '-t', '-s', str(px), '-o', str(tmp), str(svg_path)],
                   check=True, capture_output=True)
    produced = tmp / (svg_path.name + '.png')
    shutil.move(str(produced), str(png_path))
    shutil.rmtree(tmp, ignore_errors=True)

def cover_png(svg_text: str, png_path: Path):
    """qlmanage pads a wide SVG to a square and scales it, so rasterise a square
    canvas with the cover at the top, then crop the top W x H with Pillow."""
    square = svg_text.replace(f'width="{W}" height="{H}" viewBox="0 0 {W} {H}"',
                              f'width="{W}" height="{W}" viewBox="0 0 {W} {W}"', 1)
    tmp_svg = png_path.parent / '_cover_square.svg'
    tmp_svg.write_text(square)
    to_png(tmp_svg, png_path, W)
    tmp_svg.unlink()
    from PIL import Image
    with Image.open(png_path) as im:
        im.crop((0, 0, W, H)).save(png_path)

AVATARS = {  # ground name -> mark colourway
    'cream': 'charcoal-on-cream', 'charcoal': 'cream-on-charcoal',
    'pink': 'charcoal-on-pink', 'sage': 'green-on-sage',
}
AVATAR_PX = 1080
AVATAR_SCALE = 0.86   # the group then spans 26-74 of the box, inside a 76% circle

def avatar_svg(ground, ink, pink):
    off = 50 * (1 - AVATAR_SCALE)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{AVATAR_PX}" height="{AVATAR_PX}" viewBox="0 0 100 100">'
            f'<rect width="100" height="100" fill="{ground}"/>{mark_paths(ink, pink, AVATAR_SCALE, off, off)}</svg>')

# wordmark avatar: ground -> (bg, ink)
WORDMARK_AVATARS = {
    'cream': ('#F8F2EA', '#292924'), 'charcoal': ('#292924', '#F0EFE8'),
    'pink': ('#FF88C8', '#292924'), 'sage': ('#DBE1B0', '#292924'),
}
WM_PX = 400          # word width lands around 70% of the box, inside the circle
WM_TRACK = -0.045

def wordmark_avatar_svg(bg, ink, bold):
    w = measure(bold, 'plot', WM_PX, WM_TRACK)
    # Gabarito: x-height ~0.5em, p descender ~0.2em. Centre the word's optical
    # body (x-height band) on the tile, not the baseline.
    x = (AVATAR_PX - w) / 2
    baseline = AVATAR_PX / 2 + WM_PX * 0.25
    paths, _ = outline(bold, 'plot', WM_PX, WM_TRACK, x, baseline, ink)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{AVATAR_PX}" height="{AVATAR_PX}" viewBox="0 0 {AVATAR_PX} {AVATAR_PX}">'
            f'<rect width="{AVATAR_PX}" height="{AVATAR_PX}" fill="{bg}"/>{paths}</svg>')

def main():
    bold = load_bold()
    regular = load_weight(400)

    for name, (ground, ink, pink) in MARK_COLOURWAYS.items():
        svg = OUT_MARK / f'plot-mark-{name}.svg'
        svg.write_text(mark_svg(ground, ink, pink))
        for px in SIZES:
            to_png(svg, OUT_MARK / f'plot-mark-{name}-{px}.png', px)
        print('mark', name)

    for name, cw in AVATARS.items():
        ground, ink, pink = MARK_COLOURWAYS[cw]
        svg = HERE / f'plot-avatar-{name}.svg'
        svg.write_text(avatar_svg(ground, ink, pink))
        to_png(svg, HERE / f'plot-avatar-{name}.png', AVATAR_PX)
        print('avatar', name)

    for name, (bg, ink) in WORDMARK_AVATARS.items():
        svg = HERE / f'plot-avatar-wordmark-{name}.svg'
        svg.write_text(wordmark_avatar_svg(bg, ink, bold))
        to_png(svg, HERE / f'plot-avatar-wordmark-{name}.png', AVATAR_PX)
        print('wordmark avatar', name)

    for name, cols in COVERS.items():
        svg_text, start = cover_svg(*cols, bold, regular)
        svg = HERE / f'x-header-{name}.svg'
        svg.write_text(svg_text)
        cover_png(svg_text, HERE / f'x-header-{name}.png')
        print(f'cover {name}: line starts at x={start:.0f}')

if __name__ == '__main__':
    sys.exit(main())
