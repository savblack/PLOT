/** Build native launcher PNGs from the canonical marketing SVGs. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'apps/mobile/assets');
const out = path.join(assets, 'alternate-icons');
const marketing = path.join(root, 'marketing/assets');
const source = {
  MarkCharcoal: 'mark/plot-mark-cream-on-charcoal.svg',
  WordmarkCharcoal: 'plot-avatar-wordmark-charcoal.svg',
  MarkCream: 'mark/plot-mark-charcoal-on-cream.svg',
  WordmarkCream: 'plot-avatar-wordmark-cream.svg',
  MarkPink: 'mark/plot-mark-charcoal-on-pink.svg',
  WordmarkPink: 'plot-avatar-wordmark-pink.svg',
  MarkSage: 'mark/plot-mark-green-on-sage.svg',
  WordmarkSage: 'plot-avatar-wordmark-sage.svg',
};

await fs.mkdir(out, { recursive: true });
for (const [name, relative] of Object.entries(source)) {
  const svg = await fs.readFile(path.join(marketing, relative), 'utf8');
  // Mark icons are full-bleed in the marketing SVG; inset the dots so the launcher tile has breathing room.
  const padded = name.startsWith('Mark')
    ? svg.replace(/(<rect\b[^>]*\/>)(.*)<\/svg>/s, '$1<g transform="translate(50 50) scale(0.62) translate(-50 -50)">$2</g></svg>')
    : svg;
  const full = await sharp(Buffer.from(padded)).resize(1024, 1024).png().toBuffer();
  const iconPath = name === 'MarkCharcoal' ? path.join(assets, 'icon.png') : path.join(out, `${name}.png`);
  await fs.writeFile(iconPath, full);

  // Adaptive icons use transparent art over the palette's solid native ground.
  const transparentSvg = svg.replace(/<rect\b[^>]*\/>/, '');
  const foreground = await sharp(Buffer.from(transparentSvg)).resize(768, 768).png().toBuffer();
  const foregroundPath = name === 'MarkCharcoal'
    ? path.join(assets, 'android-icon-foreground.png')
    : path.join(out, `${name}-foreground.png`);
  await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#00000000' } })
    .composite([{ input: foreground, left: 128, top: 128 }])
    .png().toFile(foregroundPath);
}
