/** Build the favicon / touch-icon / manifest PNGs + favicon.ico for apps/web and apps/website
 *  from the outlined plot wordmark in apps/website/favicon.svg (cream on charcoal tile). */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = await fs.readFile(path.join(root, 'apps/website/favicon.svg'), 'utf8');
const paths = [...svg.matchAll(/<path fill="#292924" d="([^"]+)"\/>/g)].map((m) => m[1]);
if (paths.length !== 4) throw new Error('unexpected favicon.svg shape');

const BG = '#292924';
const FG = '#f8f2ea';
// Ink bounds of the wordmark outlines in favicon.svg units.
const INK = { x: 52, y: -681, w: 1568, h: 871 };

function tile(size, { fill, radius }) {
  const vbW = INK.w / fill;
  const vbH = vbW; // square tile
  const vx = INK.x + INK.w / 2 - vbW / 2;
  const vy = INK.y + INK.h / 2 - vbH / 2;
  const r = radius ? `rx="${vbW * radius}"` : '';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vx} ${vy} ${vbW} ${vbH}">` +
      `<rect x="${vx}" y="${vy}" width="${vbW}" height="${vbH}" ${r} fill="${BG}"/>` +
      `<g fill="${FG}">${paths.map((d) => `<path d="${d}"/>`).join('')}</g></svg>`,
  );
}
const render = (size, opts) => sharp(tile(size * 4, opts), { density: 72 }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

const small = { fill: 0.9, radius: 0.18 }; // browser tab sizes: rounded, tight
const touch = { fill: 0.74, radius: 0 }; // iOS masks the corners itself
const maskable = { fill: 0.58, radius: 0 }; // inside the 80% maskable safe zone

function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const dirs = images.map(({ size, buf }) => {
    const d = Buffer.alloc(16);
    d[0] = size; d[1] = size; d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(buf.length, 8); d.writeUInt32LE(offset, 12);
    offset += buf.length;
    return d;
  });
  return Buffer.concat([head, ...dirs, ...images.map((i) => i.buf)]);
}

const out = {
  'favicon-16x16.png': await render(16, small),
  'favicon-32x32.png': await render(32, small),
  'apple-touch-icon.png': await render(180, touch),
  'icon-192.png': await render(192, maskable),
  'icon-512.png': await render(512, maskable),
  'favicon.ico': ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await render(size, small) })))),
};
for (const dir of ['apps/web/public', 'apps/website']) {
  for (const [name, buf] of Object.entries(out)) await fs.writeFile(path.join(root, dir, name), buf);
}
await fs.copyFile(path.join(root, 'apps/website/favicon.svg'), path.join(root, 'apps/web/public/favicon.svg'));
console.log('wrote', Object.keys(out).join(', '));
