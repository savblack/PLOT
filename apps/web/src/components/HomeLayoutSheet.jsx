// Customize Home: the sheet behind the Jump to card's Customize action. One
// row per shelf, in the viewer's order, with a drag handle, up/down buttons
// (keyboard and touch), and a show/hide switch. Rules and persistence are in
// @plot/core/homeLayout.js and useHomeLayout.js; this file only renders.
//
// Drag uses the browser's native drag and drop so there is no new dependency.
// The buttons do the same job for anyone who cannot drag.
//
// Mobile parity: not shipped on mobile yet. Mobile Home has its own section
// set, but the ids are shared, so a layout saved here already applies to the
// shelves mobile does render once it reads profile.home_layout.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import SheetHeader from './SheetHeader.jsx';
import { SettingsSwitch } from './SettingsPage.jsx';
import './HomeLayoutSheet.css';

const C = DISCOVER_VIEW.customize;

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function Chevron({ up }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  );
}

/**
 * @param {{
 *   sections: { id: string, label: string }[],  every customizable shelf, in layout order
 *   layout: import('@plot/core/homeLayout.js').HomeLayout,
 *   isDefault: boolean,
 *   error: any,
 *   onMove: (id: string, toIndex: number) => void,
 *   onNudge: (id: string, delta: -1 | 1) => void,
 *   onToggle: (id: string) => void,
 *   onReset: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function HomeLayoutSheet({ sections, layout, isDefault, error, onMove, onNudge, onToggle, onReset, onClose }) {
  const [dragId, setDragId] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const endDrag = () => { setDragId(null); setOverIndex(null); };
  const drop = (index, e) => {
    const id = dragId ?? e.dataTransfer.getData('text/plain');
    if (id) onMove(id, index);
    endDrag();
  };

  return createPortal(
    <>
      <div className="panel-overlay" onClick={onClose} />
      <div className="panel home-layout-sheet" role="dialog" aria-label={C.title}>
        <div className="home-layout-sheet-head">
          <SheetHeader title={C.title} onClose={onClose} action={{ label: C.done, onClick: onClose }} />
        </div>
        <div className="home-layout-sheet-body">
          <p className="home-layout-sheet-intro"><span className="home-layout-intro-drag">{C.body}</span><span className="home-layout-intro-arrows">{C.bodyArrows}</span></p>
          {error && <p className="home-layout-sheet-error" role="alert">{C.saveError}</p>}
          <ol className="home-layout-list" onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverIndex(null); }}>
            {sections.map((section, index) => {
              const hidden = layout.hidden.includes(section.id);
              const cls = [
                'home-layout-row',
                hidden ? 'is-hidden' : '',
                dragId === section.id ? 'is-dragging' : '',
                overIndex === index && dragId && dragId !== section.id ? 'is-over' : '',
              ].filter(Boolean).join(' ');
              return (
                <li
                  key={section.id}
                  className={cls}
                  draggable
                  onDragStart={e => { setDragId(section.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', section.id); }}
                  onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overIndex !== index) setOverIndex(index); }}
                  onDrop={e => { e.preventDefault(); drop(index, e); }}
                  onDragEnd={endDrag}
                >
                  <span className="home-layout-grip" aria-label={C.dragHandle(section.label)} title={C.dragHandle(section.label)}><GripIcon /></span>
                  <span className="home-layout-label">
                    <span>{section.label}</span>
                    {hidden && <span className="home-layout-tag">{C.hiddenTag}</span>}
                  </span>
                  <span className="home-layout-nudge">
                    <button type="button" className="home-layout-nudge-btn" aria-label={C.moveUp(section.label)} disabled={index === 0} onClick={() => onNudge(section.id, -1)}><Chevron up /></button>
                    <button type="button" className="home-layout-nudge-btn" aria-label={C.moveDown(section.label)} disabled={index === sections.length - 1} onClick={() => onNudge(section.id, 1)}><Chevron /></button>
                  </span>
                  <SettingsSwitch label={hidden ? C.show(section.label) : C.hide(section.label)} checked={!hidden} onChange={() => onToggle(section.id)} />
                </li>
              );
            })}
          </ol>
          <button type="button" className="btn btn-secondary home-layout-reset" onClick={onReset} disabled={isDefault}>{C.reset}</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
