// A list of rows the viewer can reorder: drag (native HTML5 drag and drop, no
// dependency) or the up/down buttons for keyboard and touch. Optionally each
// row has a show/hide switch. Shared by the Customize Home sheet and the
// Sidebar order sheet; the rules and saving live with their callers.
//
// Mobile parity: mobile draws its own list in app/(app)/home-layout.tsx.
import { useState } from 'react';
import { SettingsSwitch } from './SettingsPage.jsx';
import './HomeLayoutSheet.css';

function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export function Chevron({ up }) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      {up ? <path d="M6 15l6-6 6 6" /> : <path d="M6 9l6 6 6-6" />}
    </svg>
  );
}

/**
 * @param {{
 *   rows: { id: string, label: string, hidden?: boolean }[],
 *   onMove: (id: string, toIndex: number) => void,
 *   onNudge: (id: string, delta: -1 | 1) => void,
 *   labels: { moveUp: (name: string) => string, moveDown: (name: string) => string, drag: (name: string) => string,
 *             hiddenTag?: string, show?: (name: string) => string, hide?: (name: string) => string },
 *   onToggle?: (id: string) => void,
 * }} props  onToggle: omit for a list with no show/hide.
 */
export default function ReorderRows({ rows, onMove, onNudge, labels, onToggle }) {
  const [dragId, setDragId] = useState(null);
  const [overIndex, setOverIndex] = useState(null);

  const endDrag = () => { setDragId(null); setOverIndex(null); };
  const drop = (index, e) => {
    const id = dragId ?? e.dataTransfer.getData('text/plain');
    if (id) onMove(id, index);
    endDrag();
  };

  return (
    <ol className="home-layout-list" onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOverIndex(null); }}>
      {rows.map((row, index) => {
        const cls = [
          'home-layout-row',
          onToggle ? '' : 'no-switch',
          row.hidden ? 'is-hidden' : '',
          dragId === row.id ? 'is-dragging' : '',
          overIndex === index && dragId && dragId !== row.id ? 'is-over' : '',
        ].filter(Boolean).join(' ');
        return (
          <li
            key={row.id}
            className={cls}
            draggable
            onDragStart={e => { setDragId(row.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.id); }}
            onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overIndex !== index) setOverIndex(index); }}
            onDrop={e => { e.preventDefault(); drop(index, e); }}
            onDragEnd={endDrag}
          >
            <span className="home-layout-grip" aria-label={labels.drag(row.label)} title={labels.drag(row.label)}><GripIcon /></span>
            <span className="home-layout-label">
              <span>{row.label}</span>
              {row.hidden && labels.hiddenTag && <span className="home-layout-tag">{labels.hiddenTag}</span>}
            </span>
            <span className="home-layout-nudge">
              <button type="button" className="home-layout-nudge-btn" aria-label={labels.moveUp(row.label)} disabled={index === 0} onClick={() => onNudge(row.id, -1)}><Chevron up /></button>
              <button type="button" className="home-layout-nudge-btn" aria-label={labels.moveDown(row.label)} disabled={index === rows.length - 1} onClick={() => onNudge(row.id, 1)}><Chevron /></button>
            </span>
            {onToggle && <SettingsSwitch label={row.hidden ? labels.show(row.label) : labels.hide(row.label)} checked={!row.hidden} onChange={() => onToggle(row.id)} />}
          </li>
        );
      })}
    </ol>
  );
}
