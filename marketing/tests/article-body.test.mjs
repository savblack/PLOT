import test from 'node:test';
import assert from 'node:assert/strict';
import { articleExcerpt, isArticleTable, renderArticleBlock } from '../../supabase/functions/_shared/articleBody.js';

const TABLE = [
  '| Stay | Export | Switch |',
  '| :--- | :---: | ---: |',
  '| Keep the diary | Download a file | Move the account |',
].join('\n');

test('a markdown table becomes a real table', () => {
  const html = renderArticleBlock(TABLE);
  assert.match(html, /^<div class="table-scroll"><table><thead><tr>/);
  assert.match(html, /<th>Stay<\/th><th class="a-center">Export<\/th><th class="a-right">Switch<\/th>/);
  assert.match(html, /<td>Keep the diary<\/td><td class="a-center">Download a file<\/td><td class="a-right">Move the account<\/td>/);
  assert.doesNotMatch(html, /<p>/);
});

test('prose around a table stays prose, and the opening line can be the lede', () => {
  const html = renderArticleBlock(`The choice is the point.\n${TABLE}`, { lede: true });
  assert.match(html, /^<p class="lede">The choice is the point\.<\/p><div class="table-scroll">/);
});

test('a normal paragraph is escaped, including angle brackets', () => {
  const html = renderArticleBlock('Stay <script>alert(1)</script> put.', { lede: true });
  assert.equal(html, '<p class="lede">Stay &lt;script&gt;alert(1)&lt;/script&gt; put.</p>');
});

test('a sentence with a pipe is not a table', () => {
  const html = renderArticleBlock('Stay | export, or switch.');
  assert.equal(html, '<p>Stay | export, or switch.</p>');
  assert.equal(isArticleTable('Stay | export, or switch.'), false);
});

test('a table flattened onto one line still renders when the columns agree', () => {
  const flat = '| Stay | Export | Switch | | --- | --- | --- | | Keep the diary | Download a file | Move the account |';
  const html = renderArticleBlock(flat);
  assert.match(html, /<th>Stay<\/th>/);
  assert.match(html, /<td>Move the account<\/td>/);
  assert.equal(isArticleTable(flat), true);
});

test('an HTML table keeps colspan and emphasis, and drops event handlers', () => {
  const html = renderArticleBlock(
    '<table><tr><td colspan="2" onclick="alert(1)">Stay <strong>or</strong> go</td></tr><tr><td>Export</td><td>Switch</td></tr></table>',
  );
  assert.match(html, /<td colspan="2">Stay <strong>or<\/strong> go<\/td>/);
  assert.doesNotMatch(html, /onclick|alert/);
});

test('an HTML comment is omitted, and an unclosed comment is escaped', () => {
  const html = renderArticleBlock('<table><tr><td>Stay<!-- <script>alert(1)</script> --></td></tr></table>');
  assert.match(html, /<td>Stay<\/td>/);
  assert.equal(html.includes('<!--'), false);
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<SCRIPT'), false);
  assert.equal(html.includes('alert'), false);
  const open = renderArticleBlock('<table><tr><td>Stay<!-- never closed</td></tr></table>');
  assert.match(open, /^<p>&lt;table&gt;/);
  assert.doesNotMatch(open, /<table/);
});

test('a script inside a table is not emitted', () => {
  const html = renderArticleBlock('<table><tr><td><script>alert(1)</script>Stay</td></tr></table>');
  assert.match(html, /<td>Stay<\/td>/);
  assert.equal(html.includes('<script'), false);
  assert.equal(html.includes('<SCRIPT'), false);
  assert.equal(html.includes('alert'), false);
});

test('a link inside a table is text, not an anchor', () => {
  const html = renderArticleBlock('<table><tr><td><a href="javascript:alert(1)">Stay</a></td></tr></table>');
  assert.match(html, /<td>Stay<\/td>/);
  assert.doesNotMatch(html, /<a |javascript/);
});

test('an unknown tag inside a cell is not rendered as HTML', () => {
  const html = renderArticleBlock('<table><tr><td><font>Stay</font></td></tr></table>');
  assert.match(html, /^<p>&lt;table&gt;/);
  assert.doesNotMatch(html, /<table|<font/);
});

test('the card excerpt skips a leading table', () => {
  const excerpt = articleExcerpt([TABLE, 'Letterboxd is selling. Plot is the diary that still opens.']);
  assert.equal(excerpt, 'Letterboxd is selling. Plot is the diary that still opens.');
  assert.equal(articleExcerpt([TABLE, 'Letterboxd is selling.'], 10), 'Letterboxd');
});
