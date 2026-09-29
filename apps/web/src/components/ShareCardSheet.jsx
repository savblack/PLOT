import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CARD_FORMATS, presetIndex, shareCaption, cardFilename } from '@plot/core/shareCards.js';
import { EVENTS } from '@plot/core/analyticsEvents.js';
import { track } from '../lib/analytics.js';
import { cardToPng, canCopyImages, copyImage, downloadBlob, xIntentUrl, threadsIntentUrl, openIntent } from '../utils/cardImage.js';
import { SHARE_CARDS as T } from '../copy/shareCards.js';
import { IconChevronLeft, IconChevronRight, IconClose } from './navIcons.jsx';
import ShareCard from './ShareCard.jsx';
import Spinner from './Spinner.jsx';
import './ShareCardSheet.css';

/* The share sheet: a modal over whatever page opened it, never a page of its
   own (ADR 0001). A carousel of the cards that exist for this account,
   locked ones included, a Post / Story switch, the caption that goes into
   the post, and the bar: Copy image, Download, X, Threads, Instagram.

   Web intents cannot carry an image, so X and Threads copy the PNG to the
   clipboard, open the compose window with the caption, and the status line
   says to paste it. The status lives inside the sheet rather than as a
   global toast so it is next to the button that caused it.

   DOM-only: rendering and capture are the browser's. Mobile gets a bottom
   sheet with the OS share sheet instead of per-network buttons; the data,
   captions and thresholds it uses are the same core module. */

const PREVIEW_MAX = 560;

function IconCopy() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}
function IconDownload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14" />
    </svg>
  );
}
function IconX() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.5 3h3.2l-7 8 8.3 10h-6.5l-5.1-6.6L4.6 21H1.4l7.5-8.6L1 3h6.6l4.6 6.1L17.5 3Zm-1.1 16.1h1.8L6.5 4.8H4.6l11.8 14.3Z" />
    </svg>
  );
}
function IconThreads() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12.2 22C8 22 4.6 19.6 3.6 15l2.3-.6c.8 3.5 3.3 5.3 6.3 5.3 3.7 0 5.9-2.1 5.9-5.1 0-1.7-.8-3-2.2-3.8-.3 2.9-2.1 4.6-4.7 4.6-2.2 0-3.9-1.3-3.9-3.4 0-2.3 2-3.7 4.9-3.7.6 0 1.2 0 1.8.2-.2-1.6-1.2-2.5-2.8-2.5-1.3 0-2.3.5-3 1.6L6.3 6.4C7.4 4.7 9.2 3.8 11.3 3.8c3.1 0 5 1.9 5.2 5.1 2.4 1 3.7 3 3.7 5.7 0 4.2-3.2 7.4-8 7.4Zm-2.5-9.9c0 .9.7 1.4 1.7 1.4 1.4 0 2.3-.9 2.4-2.9-.5-.1-1-.2-1.6-.2-1.6 0-2.5.7-2.5 1.7Z" />
    </svg>
  );
}
function IconInstagram() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r=".9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function unlockLine(card) {
  const { have, needed } = card.need;
  if (card.id === 'streak') return T.unlockStreak(needed);
  if (card.id.startsWith('top5')) return T.unlockTop5(have, needed);
  if (card.id === 'month-wrap') return T.unlockMonth(have, needed, card.monthName);
  return T.unlockTitles(have, needed);
}

/**
 * @param {{
 *   cards: object[],            from buildShareCards()
 *   preset?: string,            card id to open on
 *   profile: object,            the owner (username for the caption)
 *   source: string,             where it was opened from, for analytics
 *   loading?: boolean,          cards still on their way (the profile loads them on open)
 *   onClose: () => void,
 * }} props
 */
export default function ShareCardSheet({ cards, preset, profile, source, loading = false, onClose }) {
  const [index, setIndex] = useState(() => presetIndex(cards, preset));
  // When the cards arrive after the sheet opened, land on the preset then.
  const presetApplied = useRef(cards.length > 0);
  useEffect(() => {
    if (presetApplied.current || !cards.length) return;
    presetApplied.current = true;
    setIndex(presetIndex(cards, preset));
  }, [cards, preset]);
  const [format, setFormat] = useState('post');
  const [busy, setBusy] = useState(null); // target while an image is being made
  const [status, setStatus] = useState(null); // { text, action?: { label, onClick } }
  const [scale, setScale] = useState(0.3);
  const cardRef = useRef(null);
  const stageRef = useRef(null);
  const closeRef = useRef(null);
  const titleId = useId();

  const card = cards[Math.min(index, cards.length - 1)];
  const size = CARD_FORMATS[format];
  const [captionEdited, setCaptionEdited] = useState(null);
  const caption = captionEdited ?? (card ? shareCaption(card, profile, T.captions) : '');

  useEffect(() => { track(EVENTS.SHARE_CARD_OPENED, { source, card: card?.id }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset the caption and status when the card changes; the edit belonged to the old one.
  useEffect(() => { setCaptionEdited(null); setStatus(null); }, [index]); // eslint-disable-line react-hooks/set-state-in-effect

  // Scale the native-size card to the stage's width.
  useLayoutEffect(() => {
    const el = stageRef.current;
    if (!el) return undefined;
    const fit = () => {
      const w = Math.min(el.clientWidth, PREVIEW_MAX);
      const h = format === 'story' ? Math.min(window.innerHeight * 0.48, 520) : Infinity;
      setScale(Math.min(w / size.width, h / size.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [format, size.width, size.height]);

  // Escape closes; focus starts on Close; the page behind does not scroll.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'ArrowLeft') setIndex(i => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex(i => Math.min(cards.length - 1, i + 1));
    };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previousOverflow; };
  }, [onClose, cards.length]);

  const makePng = useCallback(async () => cardToPng(cardRef.current, size), [size]);

  // Copy can be refused (no permission, no ClipboardItem, an embedded
  // browser) without the image being at fault. Treat that as "not copied"
  // and fall back to a download; only a failed render is a failure.
  const tryCopy = useCallback(async (blob) => {
    try { return await copyImage(blob); } catch (err) { console.warn('[share card] clipboard refused', err); return false; }
  }, []);

  const send = useCallback(async (target) => {
    if (busy || !card?.available) return;
    setBusy(target);
    setStatus(null);
    let blob;
    try {
      blob = await makePng();
    } catch (err) {
      console.error('[share card]', err);
      setStatus({ text: T.failed });
      setBusy(null);
      return;
    }
    const filename = cardFilename(card, format);
    const openXAction = { label: T.openX, onClick: () => openIntent(xIntentUrl(caption)) };
    if (target === 'download') {
      downloadBlob(blob, filename);
      setStatus({ text: T.downloaded, action: openXAction });
    } else if (target === 'instagram') {
      downloadBlob(blob, filename);
      setStatus({ text: T.savedForStory });
    } else if (target === 'copy') {
      if (await tryCopy(blob)) setStatus({ text: T.copiedOnly, action: openXAction });
      else { downloadBlob(blob, filename); setStatus({ text: T.clipboardUnavailable }); }
    } else if (target === 'x' || target === 'threads') {
      const url = target === 'x' ? xIntentUrl(caption) : threadsIntentUrl(caption);
      const copied = await tryCopy(blob);
      if (!copied) downloadBlob(blob, filename);
      openIntent(url);
      setStatus({ text: copied ? T.copied : T.clipboardUnavailable, action: { label: target === 'x' ? T.openX : T.openThreads, onClick: () => openIntent(url) } });
    }
    track(EVENTS.SHARE_CARD_SENT, { card: card.id, format, target });
    setBusy(null);
  }, [busy, card, format, caption, makePng, tryCopy]);

  const previewStyle = useMemo(() => ({
    width: size.width * scale,
    height: size.height * scale,
  }), [size, scale]);

  if (!card && !loading) return null;

  const sheet = (
    <div className="scs-overlay" onClick={onClose}>
      <div
        className="scs"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={e => e.stopPropagation()}
      >
        <div className="scs-head">
          <h2 id={titleId} className="scs-title">{T.sheetTitle}</h2>
          <div className="cal-scope" role="tablist" aria-label="Format">
            {['post', 'story'].map(f => (
              <button key={f} type="button" role="tab" className={`cal-scope-btn${format === f ? ' active' : ''}`} aria-selected={format === f} onClick={() => setFormat(f)}>
                {f === 'post' ? T.post : T.story}
              </button>
            ))}
          </div>
          <button ref={closeRef} type="button" className="scs-close" aria-label={T.close} onClick={onClose}><IconClose /></button>
        </div>

        <div className="scs-stage" ref={stageRef}>
          {!card && (
            <div className="scs-loading" role="status" aria-live="polite">
              <Spinner size="md" ariaHidden />
              <span>{T.loadingCards}</span>
            </div>
          )}
          {card && cards.length > 1 && (
            <button type="button" className="scs-arrow scs-arrow--prev" aria-label={T.previousCard} disabled={index === 0} onClick={() => setIndex(i => i - 1)}><IconChevronLeft /></button>
          )}
          {card && <div className={`scs-preview${card.available ? '' : ' scs-preview--locked'}`} style={previewStyle} aria-label={T.cardOf(index + 1, cards.length)}>
            <div className="scs-scaler" style={{ transform: `scale(${scale})` }}>
              <ShareCard card={card} format={format} nodeRef={cardRef} />
            </div>
            {!card.available && (
              <div className="scs-lock">
                <span className="scs-lock-title">{T.locked}</span>
                <span className="scs-lock-line">{unlockLine(card)}</span>
              </div>
            )}
          </div>}
          {card && cards.length > 1 && (
            <button type="button" className="scs-arrow scs-arrow--next" aria-label={T.nextCard} disabled={index === cards.length - 1} onClick={() => setIndex(i => i + 1)}><IconChevronRight /></button>
          )}
        </div>

        {cards.length > 1 && (
          <div className="scs-dots" aria-hidden="true">
            {cards.map((c, i) => <i key={c.id} className={i === index ? 'on' : ''} />)}
          </div>
        )}

        {card?.available && (
          <>
            <label className="scs-caption">
              <span className="scs-caption-label">{T.caption}</span>
              <textarea value={caption} onChange={e => setCaptionEdited(e.target.value)} rows={2} />
            </label>
            <div className="scs-bar">
              <button type="button" className="scs-pill" disabled={!!busy} onClick={() => send('copy')}>
                {busy === 'copy' ? T.working : T.copyImage}<IconCopy />
              </button>
              <button type="button" className="scs-circ" aria-label={T.download} title={T.download} disabled={!!busy} onClick={() => send('download')}><IconDownload /></button>
              <button type="button" className="scs-circ" aria-label={T.shareToX} title={T.shareToX} disabled={!!busy} onClick={() => send('x')}><IconX /></button>
              <button type="button" className="scs-circ" aria-label={T.shareToThreads} title={T.shareToThreads} disabled={!!busy} onClick={() => send('threads')}><IconThreads /></button>
              <button type="button" className="scs-circ" aria-label={T.instagramStory} title={T.instagramStory} disabled={!!busy} onClick={() => { if (format !== 'story') setFormat('story'); send('instagram'); }}><IconInstagram /></button>
            </div>
            {!canCopyImages() && <p className="scs-hint">{T.clipboardUnavailable}</p>}
          </>
        )}

        {status && (
          <p className="scs-status" role="status" aria-live="polite">
            {status.text}
            {status.action && <button type="button" className="scs-status-action" onClick={status.action.onClick}>{status.action.label}</button>}
          </p>
        )}
      </div>
    </div>
  );

  return createPortal(sheet, document.body);
}
