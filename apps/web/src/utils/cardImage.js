// Browser-only: turn a rendered share card into a PNG and get it out of the
// tab. html-to-image serialises the node with its computed styles, inlines
// the app's fonts and the TMDB posters (image.tmdb.org sends
// Access-Control-Allow-Origin: *), and draws it to a canvas at the card's
// native size. Nothing leaves the browser: no server render, no upload.

import { toBlob } from 'html-to-image';

/**
 * @param {HTMLElement} node The unscaled card element.
 * @param {{ width: number, height: number }} size
 * @returns {Promise<Blob>}
 */
export async function cardToPng(node, { width, height }) {
  const blob = await toBlob(node, {
    width,
    height,
    pixelRatio: 1,
    cacheBust: false,
    // The preview scales the card with a transform on an ancestor; the node
    // itself is native size, and this keeps that ancestor's transform out.
    style: { transform: 'none' },
  });
  if (!blob) throw new Error('card render produced no image');
  return blob;
}

export function canCopyImages() {
  return typeof navigator !== 'undefined'
    && !!navigator.clipboard?.write
    && typeof window !== 'undefined'
    && typeof window.ClipboardItem === 'function';
}

/** @param {Blob} blob */
export async function copyImage(blob) {
  if (!canCopyImages()) return false;
  await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
  return true;
}

/** @param {Blob} blob @param {string} filename */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a tick before the URL goes away.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Web intents take text, never an image, so the image goes to the clipboard
// first and the toast tells the user to paste it.
export const xIntentUrl = (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
export const threadsIntentUrl = (text) => `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`;

export function openIntent(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}
