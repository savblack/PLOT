// The giant plot wordmark on the charts card is the website footer's SVG,
// not a second drawing. Source of truth: apps/website/_partials/footer.html.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FOOTER_PARTIAL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..', '..', 'apps', 'website', '_partials', 'footer.html',
);

export const extractFooterWordmark = (html) => {
  const match = String(html).match(/<svg\b[^>]*\bviewBox="52 -681 1403 871"[^>]*>[\s\S]*?<\/svg>/);
  if (!match) {
    throw new Error('Footer wordmark SVG missing from apps/website/_partials/footer.html');
  }
  return match[0];
};

export const loadFooterWordmark = async () => extractFooterWordmark(await readFile(FOOTER_PARTIAL, 'utf8'));
