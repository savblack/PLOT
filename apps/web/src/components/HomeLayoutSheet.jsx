// Customize Home: the sheet behind the Jump to card's Customize action.
//   Look     density and card style (free), saved in profile.ui_prefs
//   Pinned   shelves the viewer chose, at the top of Home (Premium)
//   Shelves  the built-in shelves: reorder, hide, reset
// Rules and persistence are in @plot/core (homeLayout.js, homePins.js,
// uiPrefs.js and their hooks); this file only renders. Drag uses the browser's
// native drag and drop, and every row also has buttons for keyboard and touch.
//
// Mobile parity: app/(app)/home-layout.tsx draws the same sections.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { CARD_STYLES, UI_DENSITIES } from '@plot/core/uiPrefs.js';
import { MAX_HOME_PINS } from '@plot/core/homeLayout.js';
import SheetHeader from './SheetHeader.jsx';
import ReorderRows, { Chevron } from './ReorderRows.jsx';
import './HomeLayoutSheet.css';

const C = DISCOVER_VIEW.customize;

function Segmented({ label, value, options, names, onChange }) {
  return (
    <div className="home-layout-seg-row">
      <span className="home-layout-seg-label">{label}</span>
      <div className="home-layout-seg" role="radiogroup" aria-label={label}>
        {options.map(option => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            className={`home-layout-seg-btn${value === option ? ' is-active' : ''}`}
            onClick={() => onChange(option)}
          >
            {names[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

function PinPicker({ groups, onPick, onCancel }) {
  return (
    <div className="home-layout-picker" role="group" aria-label={C.pinPickerTitle}>
      {groups.length === 0 && <p className="home-layout-sheet-intro">{C.pinNothingToPin}</p>}
      {groups.map(group => (
        <div key={group.kind} className="home-layout-picker-group">
          <span className="home-layout-picker-title">{group.label}</span>
          {group.items.map(item => (
            <button key={`${item.pin.kind}:${item.pin.id}`} type="button" className="home-layout-picker-item" onClick={() => onPick(item.pin)}>{item.label}</button>
          ))}
        </div>
      ))}
      <button type="button" className="btn btn-secondary home-layout-picker-cancel" onClick={onCancel}>{C.pinCancel}</button>
    </div>
  );
}

/**
 * @param {{
 *   sections: { id: string, label: string }[],
 *   layout: import('@plot/core/homeLayout.js').HomeLayout,
 *   isDefault: boolean,
 *   error: any,
 *   onMove: (id: string, toIndex: number) => void,
 *   onNudge: (id: string, delta: -1 | 1) => void,
 *   onToggle: (id: string) => void,
 *   onReset: () => void,
 *   onClose: () => void,
 *   prefs: import('@plot/core/uiPrefs.js').UiPrefs,
 *   onDensity: (density: string) => void,
 *   onCardStyle: (style: string) => void,
 *   premium: boolean,
 *   pins: { key: string, pin: { kind: string, id: string }, label: string }[],
 *   pinGroups: ReturnType<typeof import('@plot/core/homePins.js').pinOptions>,
 *   onPin: (pin: { kind: string, id: string }) => void,
 *   onUnpin: (pin: { kind: string, id: string }) => void,
 *   onNudgePin: (pin: { kind: string, id: string }, delta: -1 | 1) => void,
 *   onUpgrade: () => void,
 * }} props
 */
export default function HomeLayoutSheet({
  sections, layout, isDefault, error, onMove, onNudge, onToggle, onReset, onClose,
  prefs, onDensity, onCardStyle,
  premium, pins, pinGroups, onPin, onUnpin, onNudgePin, onUpgrade,
}) {
  const [picking, setPicking] = useState(false);
  const full = layout.pins.length >= MAX_HOME_PINS;

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

          <h3 className="home-layout-heading">{C.lookTitle}</h3>
          <Segmented label={C.densityLabel} value={prefs.density} options={UI_DENSITIES} names={C.density} onChange={onDensity} />
          <Segmented label={C.cardStyleLabel} value={prefs.cardStyle} options={CARD_STYLES} names={C.cardStyle} onChange={onCardStyle} />

          <h3 className="home-layout-heading">{C.pinsTitle}</h3>
          <p className="home-layout-sheet-intro home-layout-sub">{premium ? C.pinsBody : C.pinsLocked}</p>
          {premium && pins.length === 0 && <p className="home-layout-empty">{C.pinsEmpty}</p>}
          {premium && pins.length > 0 && (
            <ol className="home-layout-list">
              {pins.map((entry, index) => (
                <li key={entry.key} className="home-layout-row no-grip no-switch">
                  <span className="home-layout-label"><span>{entry.label}</span></span>
                  <span className="home-layout-nudge">
                    <button type="button" className="home-layout-nudge-btn" aria-label={C.pinMoveUp(entry.label)} disabled={index === 0} onClick={() => onNudgePin(entry.pin, -1)}><Chevron up /></button>
                    <button type="button" className="home-layout-nudge-btn" aria-label={C.pinMoveDown(entry.label)} disabled={index === pins.length - 1} onClick={() => onNudgePin(entry.pin, 1)}><Chevron /></button>
                  </span>
                  <button type="button" className="home-layout-unpin" aria-label={C.unpin(entry.label)} onClick={() => onUnpin(entry.pin)}>×</button>
                </li>
              ))}
            </ol>
          )}
          {premium && !picking && (
            <button type="button" className="btn btn-secondary home-layout-pin-add" disabled={full} onClick={() => setPicking(true)}>
              {full ? C.pinLimit(MAX_HOME_PINS) : C.pinAction}
            </button>
          )}
          {premium && picking && <PinPicker groups={pinGroups} onPick={(pin) => { onPin(pin); setPicking(false); }} onCancel={() => setPicking(false)} />}
          {!premium && <button type="button" className="btn btn-secondary home-layout-pin-add" onClick={onUpgrade}>{C.pinsUpgrade}</button>}

          <h3 className="home-layout-heading">{C.shelvesTitle}</h3>
          <ReorderRows
            rows={sections.map(s => ({ id: s.id, label: s.label, hidden: layout.hidden.includes(s.id) }))}
            onMove={onMove}
            onNudge={onNudge}
            onToggle={onToggle}
            labels={{ moveUp: C.moveUp, moveDown: C.moveDown, drag: C.dragHandle, hiddenTag: C.hiddenTag, show: C.show, hide: C.hide }}
          />
          <button type="button" className="btn btn-secondary home-layout-reset" onClick={onReset} disabled={isDefault}>{C.reset}</button>
        </div>
      </div>
    </>,
    document.body,
  );
}
