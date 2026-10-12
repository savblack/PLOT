import test from 'node:test';
import assert from 'node:assert/strict';
import {
  articleSignupPromptHtml,
  insertPromptAfterSecondParagraph,
} from '../../supabase/functions/_shared/articleSignupPrompt.js';

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

test('the inline prompt sits after the second paragraph when more copy follows', () => {
  const chunks = [
    { html: '<p>One</p>', prose: true },
    { html: '<div class="story"></div>', prose: false },
    { html: '<p>Two</p>', prose: true },
    { html: '<p>Three</p>', prose: true },
  ];
  const html = insertPromptAfterSecondParagraph(chunks, '<aside>prompt</aside>');
  assert.equal(html, '<p>One</p><div class="story"></div><p>Two</p><aside>prompt</aside><p>Three</p>');
});

test('a titles section counts as more, even when the second paragraph closes the body', () => {
  const chunks = [
    { html: '<p>One</p>', prose: true },
    { html: '<p>Two</p>', prose: true },
  ];
  const html = insertPromptAfterSecondParagraph(chunks, '<aside>prompt</aside>', true);
  assert.equal(html, '<p>One</p><p>Two</p><aside>prompt</aside>');
});

test('the second paragraph is not followed by a second copy of the prompt when it is the ending', () => {
  const chunks = [
    { html: '<p>One</p>', prose: true },
    { html: '<div class="story"></div>', prose: false },
    { html: '<p>Two</p>', prose: true },
  ];
  const html = insertPromptAfterSecondParagraph(chunks, '<aside>prompt</aside>', false);
  assert.equal(html, '<p>One</p><div class="story"></div><p>Two</p>');
});

test('a one-paragraph article does not grow an inline prompt', () => {
  const html = insertPromptAfterSecondParagraph(
    [{ html: '<p>Only</p>', prose: true }],
    '<aside>prompt</aside>',
    false,
  );
  assert.equal(html, '<p>Only</p>');
});
