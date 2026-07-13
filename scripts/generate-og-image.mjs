// Generates website/og-image.png (1200×630) by screenshotting a brand card.
// Usage: node scripts/generate-og-image.mjs
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'website', 'og-image.png');

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@200;300&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    background: #f8f8f8;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    font-family: 'DM Sans', system-ui, sans-serif;
  }
  /* grain texture, matching the site */
  body::before {
    content: '';
    position: absolute;
    inset: 0;
    opacity: 0.035;
    background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
    background-size: 200px 200px;
  }
  .wordmark {
    font-family: 'Instrument Serif', Georgia, serif;
    font-size: 220px;
    font-weight: 400;
    letter-spacing: -0.05em;
    line-height: 1;
    color: #1a1a1a;
  }
  .tagline {
    margin-top: 28px;
    font-size: 34px;
    font-weight: 200;
    color: #666;
    letter-spacing: 0.01em;
  }
  .tagline em {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    color: #1a1a1a;
  }
  .rule {
    margin-top: 44px;
    width: 64px;
    height: 2px;
    background: #e05578;
  }
</style>
</head>
<body>
  <div class="wordmark">PLOT</div>
  <div class="rule"></div>
  <div class="tagline">Your film &amp; TV journal &mdash; <em>everything you've watched, everything you want to watch.</em></div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: OUT });
await browser.close();
console.log('Wrote', OUT);
