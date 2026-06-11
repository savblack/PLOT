// Playwright render harness: loads a template HTML file, inlines base.css and
// the data payload, screenshots to JPEG. Generalizes scripts/generate-og-image.mjs.
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'templates');

export const SIZES = {
  portrait: { width: 1080, height: 1350 },   // IG 4:5
  landscape: { width: 1600, height: 900 },   // X / Threads 16:9
};

let browserPromise = null;
const getBrowser = () => (browserPromise ??= chromium.launch());

export const closeBrowser = async () => {
  if (browserPromise) {
    await (await browserPromise).close();
    browserPromise = null;
  }
};

/**
 * Render one card.
 * @param {string} templateName  e.g. 'countdown' -> templates/countdown.html
 * @param {object} data          injected as window.DATA (incl. data-uri images)
 * @param {object} opts          { size: 'portrait'|'landscape' }
 * @returns {Promise<Buffer>}    JPEG buffer
 */
export const renderCard = async (templateName, data, { size = 'portrait' } = {}) => {
  const [template, baseCss, helpersJs] = await Promise.all([
    readFile(path.join(TEMPLATES_DIR, `${templateName}.html`), 'utf8'),
    readFile(path.join(TEMPLATES_DIR, 'base.css'), 'utf8'),
    readFile(path.join(TEMPLATES_DIR, '_helpers.js'), 'utf8'),
  ]);

  const html = template
    .replace('/*INLINE_BASE_CSS*/', baseCss)
    .replace('/*HELPERS_JS*/', helpersJs)
    .replace('"/*DATA_JSON*/"', JSON.stringify(data).replace(/</g, '\\u003c'));

  const viewport = SIZES[size];
  if (!viewport) throw new Error(`Unknown size '${size}'`);

  const browser = await getBrowser();
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
  try {
    await page.setContent(html, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    return await page.screenshot({ type: 'jpeg', quality: 90 });
  } finally {
    await page.close();
  }
};
