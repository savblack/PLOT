// Draws the taste-overlap share card (9:16, 1080×1920) onto a canvas, and
// hands the finished image to Instagram, Threads or X.
//
// Web-only: it is Canvas 2D plus browser share/download. What the card SAYS
// (and whose name it may carry) comes from shareCardContent() in
// @plot/core/tasteOverlap.js, and its colours from SHARE_CARD_THEMES there, so
// mobile can render the same card natively. Mobile parity is tracked in the PR
// that added this file.
//
// Layout is written in the design canvas's 390×693 units and scaled up, so
// the numbers here can be checked against the ShareCard board directly.

import { colors } from '@plot/core/tokens.js';
import { SHARE_CARD_THEMES, SHARE_LINK, shareCardContent } from '@plot/core/tasteOverlap.js';
import { favoriteWords } from '@plot/core/spelling.js';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import { posterUrl } from './images.js';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1920;
export const FILE_NAME = 'plot-taste-match.png';
const W = 390, H = 693;
const SCALE = CARD_WIDTH / W;
const PAD = 24;
const DISPLAY = "'Gabarito', sans-serif";
const SANS = "'DM Sans', system-ui, sans-serif";
const POSTER_TIMEOUT_MS = 4000;
/** The footer sits well clear of both the rows above it and the card edge. */
const FOOTER_BASELINE = H - 34;

/** Wait for the two brand faces so the first draw is not in a fallback font. */
async function fontsReady() {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(`800 104px ${DISPLAY}`),
    document.fonts.load(`700 20px ${DISPLAY}`),
    document.fonts.load(`600 17px ${SANS}`),
    document.fonts.load(`400 15px ${SANS}`),
  ]).catch(() => {});
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), POSTER_TIMEOUT_MS);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = src;
  });
}

/** Posters are fetched once and reused across theme/name redraws. */
export function loadPosters(loved) {
  return Promise.all(loved.map(t => loadImage(posterUrl(t.poster_path, 'w342'))));
}

/**
 * Every string the card draws, resolved for the viewer's region.
 * @param {ReturnType<typeof shareCardContent>} content
 * @param {Map<number, string>} genreName
 * @param {string | null | undefined} region the viewer's own profile region
 */
export function shareCardText(content, genreName, region) {
  const hasMatch = content.match != null;
  return {
    kicker: T.matchKicker,
    me: T.me,
    pairLine: content.friendName ? T.meAnd(content.friendName) : T.meAndFriend,
    headline: hasMatch ? `${content.match}%` : String(content.watchedInCommon),
    subline: hasMatch ? T.watchedInCommon(content.watchedInCommon) : T.inCommonLabel(content.watchedInCommon),
    weBothLoved: T.weBothLoved,
    sharedGenreLabel: T.sharedGenre(favoriteWords(region).nounLower),
    sharedGenre: content.sharedGenreId != null ? genreName.get(content.sharedGenreId) || null : null,
    biggestArgumentLabel: T.biggestArgument,
    footer: T.cardFooter,
  };
}

/** The words that go with the image in a post. */
export function sharePostText(content) {
  return `${content.match != null ? T.sharePostMatch(content.match) : T.shareText} ${SHARE_LINK}`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function setLetterSpacing(ctx, px) {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`;
}

function wrap(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = word; }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
}

/** A plain head-and-shoulders glyph for a friend who isn't named. */
function drawPerson(ctx, x, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(x, cy - 7, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x, cy + 21, 17, 14, 0, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function drawCover(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} args
 * @param {ReturnType<typeof shareCardContent>} args.content
 * @param {typeof SHARE_CARD_THEMES[keyof typeof SHARE_CARD_THEMES]} args.theme
 * @param {Array<HTMLImageElement | null>} [args.posters] aligned with content.loved
 * @param {ReturnType<typeof shareCardText>} args.text
 */
export async function drawShareCard(canvas, { content, theme, posters = [], text }) {
  await fontsReady();
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = theme.ground;
  ctx.fillRect(0, 0, W, H);

  // Header: wordmark and kicker.
  ctx.fillStyle = theme.ink;
  ctx.font = `800 26px ${DISPLAY}`;
  setLetterSpacing(ctx, -0.5);
  ctx.textAlign = 'left';
  ctx.fillText('plot', PAD, 50);
  ctx.font = `700 12px ${SANS}`;
  setLetterSpacing(ctx, 1.2);
  ctx.fillStyle = theme.kicker;
  ctx.textAlign = 'right';
  ctx.fillText(text.kicker.toUpperCase(), W - PAD, 46);
  setLetterSpacing(ctx, 0);

  // The pair: "Me" and the friend's initial, or a person glyph when unnamed.
  const cy = 104, r = 32;
  const avatars = [
    { x: W / 2 - 25, fill: theme.meFill, label: text.me, size: 20 },
    { x: W / 2 + 25, fill: colors.light.accentSecondaryFill, label: content.friendName ? content.friendName.charAt(0).toUpperCase() : null, size: 22 },
  ];
  for (const a of avatars) {
    ctx.beginPath();
    ctx.arc(a.x, cy, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = theme.ground;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(a.x, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = a.fill;
    ctx.fill();
    ctx.fillStyle = colors.light.onAccentFill;
    if (a.label) {
      ctx.font = `700 ${a.size}px ${DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText(a.label, a.x, cy + a.size * 0.36);
    } else {
      drawPerson(ctx, a.x, cy, r);
    }
  }

  ctx.textAlign = 'center';
  ctx.fillStyle = theme.ink;
  ctx.font = `600 17px ${SANS}`;
  ctx.fillText(text.pairLine, W / 2, 168);

  // The headline on its own solid panel, as on the other share cards.
  roundRect(ctx, 52, 188, W - 104, 128, 22);
  ctx.fillStyle = theme.hero;
  ctx.fill();
  ctx.fillStyle = theme.heroInk;
  ctx.font = `800 104px ${DISPLAY}`;
  setLetterSpacing(ctx, -3);
  ctx.fillText(text.headline, W / 2, 290);
  setLetterSpacing(ctx, 0);

  ctx.fillStyle = theme.soft;
  ctx.font = `400 15px ${SANS}`;
  ctx.fillText(text.subline, W / 2, 342);

  // "We both loved": up to three posters, centred.
  if (content.loved.length) {
    const pw = 88, ph = 132, gap = 10, top = 364;
    const total = content.loved.length * pw + (content.loved.length - 1) * gap;
    let x = (W - total) / 2;
    content.loved.forEach((t, i) => {
      ctx.save();
      roundRect(ctx, x, top, pw, ph, 12);
      ctx.clip();
      ctx.fillStyle = theme.panel;
      ctx.fillRect(x, top, pw, ph);
      const img = posters[i];
      if (img) {
        drawCover(ctx, img, x, top, pw, ph);
      } else {
        ctx.fillStyle = theme.panelInk;
        ctx.font = `700 13px ${DISPLAY}`;
        ctx.textAlign = 'left';
        const lines = wrap(ctx, t.title, pw - 16, 4);
        lines.forEach((l, j) => ctx.fillText(l, x + 8, top + ph - 10 - (lines.length - 1 - j) * 15));
      }
      ctx.restore();
      x += pw + gap;
    });
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.soft;
    ctx.font = `400 12px ${SANS}`;
    ctx.fillText(text.weBothLoved, W / 2, top + ph + 19);
  }

  // Bottom rows, stacked up from the footer.
  ctx.fillStyle = theme.soft;
  ctx.font = `400 12px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillText(text.footer, W / 2, FOOTER_BASELINE);

  const rows = [
    text.sharedGenre && [text.sharedGenreLabel, text.sharedGenre],
    content.biggestArgument && [text.biggestArgumentLabel, content.biggestArgument],
  ].filter(Boolean);
  const rowH = 42, rowGap = 8;
  let rowTop = FOOTER_BASELINE - 32 - rows.length * rowH - (rows.length - 1) * rowGap;
  for (const [label, value] of rows) {
    roundRect(ctx, PAD, rowTop, W - PAD * 2, rowH, 16);
    ctx.fillStyle = theme.panel;
    ctx.fill();
    ctx.font = `400 14px ${SANS}`;
    ctx.fillStyle = theme.panelInk;
    ctx.textAlign = 'left';
    ctx.fillText(label, PAD + 14, rowTop + 26);
    ctx.font = `700 14px ${SANS}`;
    ctx.textAlign = 'right';
    const maxValue = W - PAD * 2 - 28 - ctx.measureText(label).width - 16;
    let v = value;
    while (ctx.measureText(v).width > maxValue && v.length > 4) v = `${v.slice(0, -2)}…`;
    ctx.fillText(v, W - PAD - 14, rowTop + 26);
    rowTop += rowH + rowGap;
  }
}

/** PNG blob of the canvas, or null when a poster tainted it. */
export function canvasToBlob(canvas) {
  return new Promise((resolve) => {
    try { canvas.toBlob(b => resolve(b), 'image/png'); } catch { resolve(null); }
  });
}

/**
 * Draw and export in one go. A poster without CORS headers taints the canvas;
 * then it is redrawn without images (titles on tiles) rather than failing.
 */
export async function exportShareCard(canvas, args) {
  await drawShareCard(canvas, args);
  let blob = await canvasToBlob(canvas);
  if (!blob) {
    await drawShareCard(canvas, { ...args, posters: [] });
    blob = await canvasToBlob(canvas);
  }
  return blob;
}

/**
 * An off-screen card with the defaults (cream, friend unnamed), for the quick
 * share menu that skips the customise dialog.
 */
export async function renderShareCardBlob({ overlap, target, genreName, region, theme = 'cream', showName = false }) {
  const content = shareCardContent(overlap, target, { showName });
  const posters = await loadPosters(content.loved);
  const canvas = document.createElement('canvas');
  const blob = await exportShareCard(canvas, {
    content, theme: SHARE_CARD_THEMES[theme], posters, text: shareCardText(content, genreName, region),
  });
  return { blob, content };
}

export function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = FILE_NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const NETWORKS = /** @type {const} */ (['instagram', 'threads', 'x']);

const INTENTS = {
  threads: (text) => `https://www.threads.net/intent/post?text=${encodeURIComponent(text)}`,
  x: (text) => `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
};

/** True where the browser can hand an image to an app's share sheet (phones). */
export function canShareImage() {
  if (typeof navigator === 'undefined' || !navigator.canShare) return false;
  try { return navigator.canShare({ files: [new File([''], 'x.png', { type: 'image/png' })] }); } catch { return false; }
}

/**
 * Send the card to a network. Phones get the system share sheet with the image
 * attached (the person picks the app there). On desktop no network accepts an
 * image through a link, so the image is saved and, for Threads and X, a
 * compose window opens with the text for them to attach it to.
 *
 * Must be called straight from a click: the compose window is opened before
 * anything is awaited, or popup blockers stop it.
 *
 * @param {'instagram' | 'threads' | 'x'} network
 * @param {Blob} blob
 * @param {string} text
 * @returns {Promise<{ method: 'native' | 'cancelled' | 'download' | 'intent', message?: string }>}
 */
export async function shareToNetwork(network, blob, text) {
  if (canShareImage()) {
    try {
      await navigator.share({ files: [new File([blob], FILE_NAME, { type: 'image/png' })], text });
      return { method: 'native' };
    } catch (e) {
      if (e?.name === 'AbortError') return { method: 'cancelled' };
      // Fall through to the desktop path.
    }
  }
  const intent = INTENTS[network];
  if (intent) window.open(intent(text), '_blank', 'noopener,noreferrer');
  downloadBlob(blob);
  return intent
    ? { method: 'intent', message: T.attachSaved(T.networks[network]) }
    : { method: 'download', message: T.instagramSaved };
}
