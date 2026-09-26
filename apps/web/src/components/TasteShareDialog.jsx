import { useEffect, useId, useMemo, useRef, useState } from 'react';
import ResponsiveDialog from './ResponsiveDialog.jsx';
import { useApp } from '../hooks/useApp.js';
import { regionalWords } from '../utils/spelling.js';
import { SHARE_CARD_THEMES, canNameOnShareCard, shareCardContent } from '@plot/core/tasteOverlap.js';
import { drawShareCard, exportShareCard, loadPosters, shareCardText, sharePostText, shareToNetwork, downloadBlob, NETWORKS } from '../utils/tasteShareImage.js';
import { NETWORK_ICONS } from './NetworkIcons.jsx';
import { TASTE_OVERLAP as T } from '../copy/tasteOverlap.js';
import './TasteShareDialog.css';

const THEME_KEYS = /** @type {Array<keyof typeof SHARE_CARD_THEMES>} */ (Object.keys(SHARE_CARD_THEMES));

/**
 * "Share your match": previews the 9:16 card and shares or downloads it as a
 * PNG. The preview IS the exported canvas, so what you see is what is posted.
 *
 * The friend's name is off by default and can only be turned on when their
 * profile is public (canNameOnShareCard), because this goes to social media
 * without their say.
 */
export default function TasteShareDialog({ overlap, target, genreName, onClose }) {
  const { profile } = useApp();
  const canvasRef = useRef(null);
  const [theme, setTheme] = useState('cream');
  const [showName, setShowName] = useState(false);
  const [posters, setPosters] = useState(null);
  const [busy, setBusy] = useState(false);
  const toggleId = useId();
  const hintId = useId();
  const themeLabelId = useId();
  const nameAllowed = canNameOnShareCard(target);
  const name = target.display_name || target.username;
  const colour = regionalWords('color', profile?.region);

  const content = useMemo(() => shareCardContent(overlap, target, { showName }), [overlap, target, showName]);

  useEffect(() => {
    let alive = true;
    loadPosters(content.loved).then(p => { if (alive) setPosters(p); });
    return () => { alive = false; };
  // Posters only depend on which titles are loved, not on theme or name.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlap]);

  const text = useMemo(() => shareCardText(content, genreName, profile?.region), [content, genreName, profile?.region]);

  useEffect(() => {
    if (!canvasRef.current || posters === null) return;
    drawShareCard(canvasRef.current, { content, theme: SHARE_CARD_THEMES[theme], posters, text });
  }, [content, theme, posters, text]);

  const [message, setMessage] = useState('');
  const args = () => ({ content, theme: SHARE_CARD_THEMES[theme], posters, text });

  // The blob is exported fresh for each action so it matches what's on screen.
  // shareToNetwork opens compose windows before awaiting, so the export has to
  // be ready first: it is kept up to date after every redraw.
  const [blob, setBlob] = useState(null);
  useEffect(() => {
    if (posters === null) return undefined;
    let alive = true;
    exportShareCard(document.createElement('canvas'), args()).then(b => { if (alive) setBlob(b); });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, theme, posters, text]);

  const toNetwork = async (network) => {
    if (!blob) return;
    setBusy(true);
    const result = await shareToNetwork(network, blob, sharePostText(content));
    setMessage(result.message || '');
    setBusy(false);
  };

  const download = () => { if (blob) downloadBlob(blob); };

  const ready = !busy && !!blob;

  return (
    <ResponsiveDialog
      title={T.shareTitle}
      onClose={onClose}
      size="wide"
      tall
      surfaceClassName="tsd-surface"
      footer={(
        <div className="tsd-actions">
          <div className="tsd-networks" role="group" aria-label={T.shareTo}>
            <span className="tsd-networks-label">{T.shareTo}</span>
            {NETWORKS.map(n => {
              const Icon = NETWORK_ICONS[n];
              return (
                <button key={n} type="button" className="tsd-network" aria-label={T.networks[n]} onClick={() => toNetwork(n)} disabled={!ready}>
                  <Icon /><span>{T.networks[n]}</span>
                </button>
              );
            })}
          </div>
          <button type="button" className="btn btn-primary" onClick={download} disabled={!ready}>{T.downloadImage}</button>
        </div>
      )}
    >
      <div className="tsd">
        <div className="tsd-stage">
          <canvas ref={canvasRef} className="tsd-preview" width="1080" height="1920" role="img"
            aria-label={`${text.pairLine}. ${T.matchKicker}: ${text.headline}. ${text.subline}.`} />
        </div>

        <div className="tsd-controls">
          <div className="tsd-group">
            <span className="tsd-label" id={themeLabelId}>{T.cardColour(colour.nounLower)}</span>
            <div className="tsd-swatches" role="radiogroup" aria-labelledby={themeLabelId}>
              {THEME_KEYS.map(key => (
                <label key={key} className={`tsd-swatch${theme === key ? ' is-active' : ''}`}>
                  <input type="radio" name="tsd-theme" value={key} checked={theme === key} onChange={() => setTheme(key)} />
                  <span className="tsd-swatch-dot" style={{ background: SHARE_CARD_THEMES[key].ground }} aria-hidden="true" />
                  <span className="tsd-swatch-name">{T.themes[key]}</span>
                </label>
              ))}
            </div>
          </div>

          {message && <p className="tsd-message" role="status">{message}</p>}

          <div className={`tsd-group tsd-name${nameAllowed ? '' : ' is-locked'}`}>
            <span className="tsd-name-text">
              <label htmlFor={toggleId} className="tsd-name-title">{T.showName(name)}</label>
              <span className="tsd-hint" id={hintId}>{nameAllowed ? T.nameAllowed : T.nameNeedsPublic}</span>
            </span>
            <input id={toggleId} className="tsd-switch" type="checkbox" role="switch" aria-describedby={hintId}
              checked={showName && nameAllowed} disabled={!nameAllowed} onChange={e => setShowName(e.target.checked)} />
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
