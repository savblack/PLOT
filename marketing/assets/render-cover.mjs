import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const targets = [
  ['x-header-wordmark.svg', 'x-header-wordmark.png'],
  ['x-cover-wordmark.svg', 'x-cover-wordmark.png'],
  ['x-cover-wordmark-coral.svg', 'x-cover-wordmark-coral.png'],
  ['x-cover-plotline.svg', 'x-cover-plotline.png'],
  ['x-cover-filmframe.svg', 'x-cover-filmframe.png'],
  ['x-cover-letterpress.svg', 'x-cover-letterpress.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: 2 });

for (const [svg, png] of targets) {
  const data = readFileSync(join(here, svg), 'utf8');
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">${data}</body></html>`,
    { waitUntil: 'networkidle' }
  );
  await page.screenshot({ path: join(here, png), clip: { x: 0, y: 0, width: 1500, height: 500 } });
  console.log('wrote', png);
}

await browser.close();
