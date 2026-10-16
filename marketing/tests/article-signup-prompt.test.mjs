import test from 'node:test';
import assert from 'node:assert/strict';
import { articleSignupPromptHtml } from '../../supabase/functions/_shared/articleSignupPrompt.js';

const prompt = articleSignupPromptHtml({
  app: 'https://app.theplot.tv',
  slug: 'widows-bay',
  placement: 'whats_on_article_inline',
});

test('the prompt uses the article signup link and an exact line of copy', () => {
  assert.match(prompt, /Track this on Plot\. Free forever\. No credit card required\./);
  assert.match(prompt, />Start tracking</);
  assert.match(prompt, /href="https:\/\/app\.theplot\.tv\/signup\?src=whats_on_article&amp;utm_content=widows-bay"/);
  assert.match(prompt, /data-cta="whats_on_article_inline"/);
  assert.equal(prompt.toLowerCase().includes('letterboxd'), false);
});

test('a slug with reserved characters stays inside the attribute', () => {
  const html = articleSignupPromptHtml({
    app: 'https://app.theplot.tv',
    slug: 'a&b"c',
    placement: 'whats_on_article_end',
  });
  assert.match(html, /utm_content=a%26b%22c/);
  assert.match(html, /data-cta="whats_on_article_end"/);
  assert.equal(html.includes('"c"'), false);
});
