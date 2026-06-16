import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const targets = [
  ['x-header-a.html', 'x-header-a.png'],
  ['x-header-b.html', 'x-header-b.png'],
  ['x-header-light-a.html', 'x-header-light-a.png'],
  ['x-header-light-b.html', 'x-header-light-b.png'],
  ['x-cover-billing.html', 'x-cover-billing.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 500 }, deviceScaleFactor: 2 });

for (const [html, png] of targets) {
  await page.goto(pathToFileURL(join(here, html)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, png), clip: { x: 0, y: 0, width: 1500, height: 500 } });
  console.log('wrote', png);
}

await browser.close();
