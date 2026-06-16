import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const targets = [
  ['instagram-profile.svg', 'instagram-profile.png'],
  ['instagram-profile-monogram.svg', 'instagram-profile-monogram.png'],
  ['instagram-profile-cream.svg', 'instagram-profile-cream.png'],
  ['instagram-profile-monogram-cream.svg', 'instagram-profile-monogram-cream.png'],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 });

for (const [svg, png] of targets) {
  const data = readFileSync(join(here, svg), 'utf8');
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0">${data}</body></html>`,
    { waitUntil: 'networkidle' }
  );
  await page.screenshot({ path: join(here, png), clip: { x: 0, y: 0, width: 1080, height: 1080 } });
  console.log('wrote', png);
}

await browser.close();
