import { useEffect, useId, useRef, useState } from 'react';
import { useApp } from '../hooks/useApp.js';
import { regionalWords } from '../utils/spelling.js';
import { NETWORKS, renderShareCardBlob, sharePostText, shareToNetwork } from '../utils/tasteShareImage.js';
import { NETWORK_ICONS, ShareIcon } from './NetworkIcons.jsx';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import './TasteShareMenu.css';

/**
 * The small share icon on the taste overlap page. Opens a menu of Instagram,
 * Threads and X that shares the default card (cream, friend unnamed) in one
 * tap, plus a way into the full dialog to change the colour or add a name.
 *
 * The card is rendered as soon as the menu opens, so a tap can hand it over
 * synchronously (compose windows opened after an await get popup-blocked).
 */
export default function TasteShareMenu({ overlap, target, genreName, onCustomise }) {
  const { profile } = useApp();
  const [open, setOpen] = useState(false);
  const [card, setCard] = useState(null);
  const [message, setMessage] = useState('');
  const rootRef = useRef(null);
  const menuId = useId();
  const colour = regionalWords('color', profile?.region);

  useEffect(() => {
    if (!open || card) return undefined;
    let alive = true;
    renderShareCardBlob({ overlap, target, genreName, region: profile?.region })
      .then(result => { if (alive) setCard(result); });
    return () => { alive = false; };
  }, [open, card, overlap, target, genreName, profile?.region]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const share = async (network) => {
    if (!card?.blob) return;
    const result = await shareToNetwork(network, card.blob, sharePostText(card.content));
    setMessage(result.message || '');
    if (!result.message && result.method !== 'cancelled') setOpen(false);
  };

  return (
    <div className="tsm" ref={rootRef}>
      <button
        type="button"
        className="to-icon-btn"
        aria-label={T.shareMenuLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => { setOpen(o => !o); setMessage(''); }}
      >
        <ShareIcon />
      </button>
      {open && (
        <div className="tsm-menu" id={menuId} role="menu" aria-label={T.shareTo}>
          <span className="tsm-label">{T.shareTo}</span>
          {NETWORKS.map(n => {
            const Icon = NETWORK_ICONS[n];
            return (
              <button key={n} type="button" role="menuitem" className="tsm-item" onClick={() => share(n)} disabled={!card?.blob}>
                <span className="tsm-icon"><Icon /></span>
                {T.networks[n]}
              </button>
            );
          })}
          <div className="tsm-divider" role="separator" />
          <button type="button" role="menuitem" className="tsm-item tsm-item--quiet" onClick={() => { setOpen(false); onCustomise(); }}>
            {T.changeCard(colour.nounLower)}
          </button>
          {message && <p className="tsm-message" role="status">{message}</p>}
        </div>
      )}
    </div>
  );
}
