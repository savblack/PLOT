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
