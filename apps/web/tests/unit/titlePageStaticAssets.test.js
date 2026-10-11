import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readFromRoot = (path) => readFile(new URL(`../../../../${path}`, import.meta.url), 'utf8');
const version = (content) => createHash('sha256').update(content).digest('hex').slice(0, 12);

test('title pages load shared presentation assets from Cloudflare Pages', async () => {
  const [page, css, js] = await Promise.all([
    readFromRoot('supabase/functions/title-page/index.ts'),
    readFromRoot('apps/website/title-page.css'),
    readFromRoot('apps/website/title-page.js'),
  ]);

  assert.match(page, /href="\$\{SITE\}\/_partials\/footer\.css"/);
  assert.ok(page.includes(`href="\${SITE}/title-page.css?v=${version(css)}"`));
  assert.ok(page.includes(`src="\${SITE}/title-page.js?v=${version(js)}"`));
  assert.doesNotMatch(page, /const (?:PH|GA_GTM|STYLE) =/);
  assert.doesNotMatch(page, /<style>\$\{STYLE\}<\/style>/);

  assert.match(css, /@font-face/);
  assert.match(css, /url\('\/fonts\/DMSans-Variable\.woff2'\)/);
  assert.doesNotMatch(css, /\$\{FOOTER_CSS\}/);
  assert.match(js, /posthog\.init/);
  assert.match(js, /gtag\('config'/);
  assert.match(js, /navLinks/);
});
