import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// Ko-fi's own guidance is a 3:1 cover, ideally 1200x400, and it crops the sides
// on narrow viewports. The 1200x300 entries below predate that and are 4:1, so
// Ko-fi scales them to fill the height and crops roughly a quarter of the width.
// Each target carries its own frame size; rendered at 2x for a crisp upload.
const targets = [
  ['kofi-banner-a.html', 'kofi-banner-a.png', 1200, 300],
  ['kofi-banner-b.html', 'kofi-banner-b.png', 1200, 300],
  ['kofi-banner-c.html', 'kofi-banner-c.png', 1200, 300],
  ['kofi-banner-d.html', 'kofi-banner-d.png', 1200, 300],
  ['kofi-banner-e.html', 'kofi-banner-e.png', 1200, 300],
  ['kofi-banner-f.html', 'kofi-banner-f.png', 1200, 300],
  ['kofi-banner-g.html', 'kofi-banner-g.png', 1200, 300],
  ['kofi-banner-h.html', 'kofi-banner-h.png', 1200, 300],
  ['kofi-banner-i.html', 'kofi-banner-i.png', 1200, 300],
  ['kofi-banner-n.html', 'kofi-banner-n.png', 1200, 300],
  ['kofi-banner-o.html', 'kofi-banner-o.png', 1200, 400],
];

// Uses the locally installed Chrome so this runs without `npx playwright install`.
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1200, height: 400 }, deviceScaleFactor: 2 });

for (const [html, png, width, height] of targets) {
  await page.setViewportSize({ width, height });
  await page.goto(pathToFileURL(join(here, html)).href, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, png), clip: { x: 0, y: 0, width, height } });
  console.log('wrote', png, `${width}x${height}`);
}

await browser.close();
