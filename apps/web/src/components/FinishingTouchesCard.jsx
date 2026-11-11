// The Finishing touches card, render only (FinishingTouches.jsx owns the data,
// the stored state and the sheets), so Storybook can show every state.
// PremiumFirstWeek.jsx draws the same card with its own wording (`labels`).
import { FINISHING_TOUCHES } from '../copy/finishingTouches.js';
import { COMMON } from '../copy/common.js';
import './FinishingTouches.css';

function Tick({ done, T }) {
  return (
    <span className={`ft-tick${done ? ' is-done' : ''}`} role="img" aria-label={done ? T.done : T.notDone}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7" /></svg>
    </span>
  );
}

/**
 * @param {{
 *   tiles: Array<{ id: string, done: boolean, title: string, sub: string, cta?: string, dismiss?: string }>,
 *   doneCount: number, total: number, allDone: boolean, expanded: boolean,
 *   onToggle: () => void, onHide: () => void, onClose: () => void,
 *   onAction: (id: string) => void, onDismiss?: (id: string) => void,
 *   labels?: Pick<typeof FINISHING_TOUCHES, 'title' | 'count' | 'progressLabel' | 'expand' | 'collapse' | 'done' | 'notDone' | 'ready' | 'readyBody' | 'nice'>,
 * }} props
 */
export default function FinishingTouchesCard({ tiles, doneCount, total, allDone, expanded, onToggle, onHide, onClose, onAction, onDismiss, labels: T = FINISHING_TOUCHES }) {
  if (allDone) {
    return (
      <section className="ft-ready" aria-live="polite">
        <span className="ft-ready-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L19 7" /></svg></span>
        <div className="ft-ready-text">
          <h2>{T.ready}</h2>
          <p>{T.readyBody}</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>{T.nice}</button>
      </section>
    );
  }

  return (
    <section className="ft-card" aria-label={T.title}>
      <div className="ft-head">
        <h2 className="ft-title">{T.title}</h2>
        <span className="ft-bar" role="img" aria-label={T.progressLabel(doneCount, total)}>
          {tiles.map((tile, i) => <span key={tile.id} className={i < doneCount ? 'is-on' : ''} />)}
        </span>
        <span className="ft-count">{T.count(doneCount, total)}</span>
        <span className="ft-spacer" />
        <button type="button" className="ft-hide" onClick={onHide}>{COMMON.dismiss}</button>
        <button type="button" className="ft-toggle" aria-expanded={expanded} aria-label={expanded ? T.collapse : T.expand} onClick={onToggle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ transform: expanded ? 'rotate(180deg)' : 'none' }}><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {expanded && (
        <div className="ft-grid" style={{ '--ft-cols': String(tiles.length) }}>
          {tiles.map(tile => (
            <div key={tile.id} className={`ft-tile ft-tile--${tile.id}${tile.done ? ' is-done' : ''}`}>
              <span className="ft-tile-head"><Tick done={tile.done} T={T} /><span className="ft-tile-title">{tile.title}</span></span>
              <span className="ft-tile-sub">{tile.sub}</span>
              {!tile.done && tile.cta && (
                <button type="button" className="ft-tile-cta" onClick={() => onAction(tile.id)}>
                  {tile.cta}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
              )}
              {!tile.done && tile.dismiss && onDismiss && (
                <button type="button" className="ft-tile-dismiss" onClick={() => onDismiss(tile.id)}>
                  {tile.dismiss}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
