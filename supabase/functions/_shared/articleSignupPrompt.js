/**
 * Sign-up prompt for What's On articles.
 *
 * The link keeps src=whats_on_article and utm_content=<slug>, the same pair
 * the app already reads for article attribution. data-cta is only the
 * PostHog placement. The two are not interchangeable.
 */

const PROMPT_COPY = 'Track this on Plot. Free forever. No credit card required.';
const PROMPT_BUTTON = 'Start tracking';

const escAttr = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;');

/**
 * @param {{ app: string, slug: string, placement: string }} opts
 */
export function articleSignupPromptHtml({ app, slug, placement }) {
  const href = `${app}/signup?src=whats_on_article&utm_content=${encodeURIComponent(slug || '')}`;
  return `<aside class="track-prompt">
  <p>${PROMPT_COPY}</p>
  <a class="cta" href="${escAttr(href)}" data-cta="${escAttr(placement)}">${PROMPT_BUTTON}</a>
</aside>`;
}

/**
 * Insert the prompt after the second prose block, and only when something
 * still follows it. A story or trailer module is not a paragraph. When the
 * second paragraph is already the end of the article, the caller places one
 * prompt at the end instead of two in a row.
 *
 * @param {Array<{ html: string, prose?: boolean }>} chunks
 * @param {string} promptHtml
 * @param {boolean} [moreAfter] true when a titles section follows the body
 */
export function insertPromptAfterSecondParagraph(chunks, promptHtml, moreAfter = false) {
  const html = [];
  let proseSeen = 0;
  let inserted = false;
  chunks.forEach((chunk, index) => {
    html.push(chunk.html);
    if (!chunk.prose) return;
    proseSeen += 1;
    if (inserted || proseSeen !== 2) return;
    const moreFollows = index < chunks.length - 1 || moreAfter;
    if (moreFollows) html.push(promptHtml);
    inserted = true;
  });
  return html.join('');
}
