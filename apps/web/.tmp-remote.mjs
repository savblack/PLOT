import { chromium } from 'playwright';
const base = process.argv[2].replace(/\/$/, '');
const idx = await (await fetch(base + '/index.json')).json();
const ids = Object.values(idx.entries).filter(e => e.type === 'story').map(e => e.id);
const browser = await chromium.launch(); const page = await browser.newPage();
const bad = [];
for (const id of ids) {
  const errs = []; const onErr = e => errs.push(String(e.message || e).slice(0, 240));
  page.on('pageerror', onErr);
  await page.goto(`${base}/iframe.html?id=${id}&viewMode=story`, { waitUntil: 'load', timeout: 30000 }).catch(e => errs.push('nav ' + e.message));
  await page.waitForTimeout(1200);
  const shown = await page.evaluate(() => document.body.classList.contains('sb-show-errordisplay')).catch(() => false);
  const msg = shown ? (await page.locator('#error-message').innerText().catch(() => '')).slice(0, 300) : '';
  page.off('pageerror', onErr);
  if (errs.length || msg) bad.push({ id, errs: [...new Set(errs)], msg });
}
console.log(`stories: ${ids.length}, failing: ${bad.length}`); for (const b of bad) console.log(JSON.stringify(b));
await browser.close();
