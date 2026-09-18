// Generates apps/web/public/og-image.png (1200×630) from the card already
// committed as og-image.svg. Usage: node scripts/generate-app-og-image.mjs
//
// WHY A PNG WHEN THE SVG EXISTS: index.html points og:image/twitter:image at
// /og-image.png, and only the .svg was ever committed — so the tag resolved to
// the SPA shell (200, text/html) and every bare-domain share unfurled without
// an image. Social platforms do not accept SVG for og:image, so the fix is to
// rasterise, not to repoint the tag.
//
// Sibling of generate-og-image.mjs, which builds the marketing site's card from
// hand-written HTML. This one only rasterises the app's existing artwork: the
// design lives in the SVG, not here.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG = path.join(ROOT, 'apps', 'web', 'public', 'og-image.svg');
const OUT = path.join(ROOT, 'apps', 'web', 'public', 'og-image.png');
const FONTS_DIR = path.join(ROOT, 'apps', 'web', 'public', 'fonts');

// The wordmark is outlined paths, but the tagline is live <text> in DM Sans.
// setContent() never navigates, so a relative font URL cannot resolve — embed
// the same file apps/web self-hosts, or Chromium silently falls back to
// Helvetica and the card ships in the wrong face.
const fontDataUri = (file) => `data:font/ttf;base64,${readFileSync(path.join(FONTS_DIR, file)).toString('base64')}`;

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  @font-face {
    font-family: 'DM Sans';
    src: url(${fontDataUri('DMSans-Regular.ttf')}) format('truetype');
    font-weight: 400; font-style: normal;
  }
  * { margin: 0; padding: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; }
  svg { display: block; }
</style>
</head>
<body>${readFileSync(SVG, 'utf8')}</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html);
// The tagline renders in the wrong face if the screenshot wins the race.
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT, type: 'png' });
await browser.close();

console.log(`Wrote ${path.relative(ROOT, OUT)}`);
