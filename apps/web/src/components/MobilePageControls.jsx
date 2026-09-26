import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMMON } from '../copy/common.js';
import { MOBILE_CONTROLS } from '@plot/core/copy/mobileControls.js';
import { activeFilterGroupCount, nextSheetSnap } from '../utils/mobileSheets.js';

function sameValues(values, defaults) {
  if (values.length !== defaults.length) return false;
  const set = new Set(defaults);
  return values.every(value => set.has(value));
}

// Web-only presentation: the native dialog owns modal focus handling while the
// page continues to own every filter value and data query.
export default function MobilePageControls({ groups = [], options, value, onChange, label, title }) {
  const [open, setOpen] = useState(false);
  const [snap, setSnap] = useState('collapsed');
  const dialog = useRef(null);
  const sheet = useRef(null);
  const trigger = useRef(null);
  const drag = useRef({ active: false, startY: 0, startTime: 0, snap: 'collapsed' });
  const titleId = useId();
  const normalizedGroups = useMemo(() => options ? [{
    heading: title || MOBILE_CONTROLS.filters,
    mode: 'single',
    value,
    defaultValue: value,
    options,
    onChange,
  }] : groups, [groups, onChange, options, title, value]);
  const visible = normalizedGroups.filter(group => group.options?.length > 0);
  const activeCount = activeFilterGroupCount(visible);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const opener = trigger.current;
    element.showModal();
    const desktop = window.matchMedia('(min-width: 1024px)');
    const onResize = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener('change', onResize);
    return () => {
      desktop.removeEventListener('change', onResize);
      element.close();
      opener?.focus();
    };
  }, [open]);

  const startDrag = (event) => {
    if (event.pointerType === 'mouse') return;
    drag.current = { active: true, startY: event.clientY, startTime: performance.now(), snap };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sheet.current?.classList.add('is-dragging');
  };

  const moveDrag = (event) => {
    if (!drag.current.active || !sheet.current) return;
    const delta = event.clientY - drag.current.startY;
    const limited = drag.current.snap === 'expanded' ? Math.max(0, delta) : delta;
    sheet.current.style.setProperty('--sheet-drag-y', `${limited}px`);
  };

  const endDrag = (event) => {
    if (!drag.current.active) return;
    const delta = event.clientY - drag.current.startY;
    const velocity = delta / Math.max(performance.now() - drag.current.startTime, 1);
    const next = nextSheetSnap({ snap: drag.current.snap, delta, velocity });
    drag.current.active = false;
    sheet.current?.classList.remove('is-dragging');
    sheet.current?.style.removeProperty('--sheet-drag-y');
    if (next === 'dismissed') close();
    else setSnap(next);
  };

  const updateMultiple = (group, optionId) => {
    const values = Array.isArray(group.value) ? group.value : [];
    group.onChange(values.includes(optionId)
      ? values.filter(item => item !== optionId)
      : [...values, optionId]);
  };

  const reset = () => visible.forEach(group => group.onChange(group.defaultValue ?? (group.mode === 'single' ? group.value : [])));

  return (
    <>
      <span className="mobile-controls-anchor" hidden />
      {createPortal(<div className="mobile-page-controls">
        <button ref={trigger} type="button" className="mobile-controls-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setSnap('collapsed'); setOpen(true); }}>
          {label || MOBILE_CONTROLS.filterLabel(activeCount)}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 8 4-4 4 4" /></svg>
        </button>
      </div>, document.body)}
      {open && createPortal(
        <dialog ref={dialog} className="mobile-controls-dialog" aria-labelledby={titleId} onCancel={close} onClick={event => { if (event.target === event.currentTarget) close(); }}>
          <section ref={sheet} className={`mobile-controls-sheet mobile-controls-sheet--${snap}`}>
            <div className="mobile-controls-grab" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
              <div className="mobile-controls-handle" aria-hidden="true" />
              <div className="mobile-controls-heading">
                <h2 id={titleId}>{title || MOBILE_CONTROLS.filters}</h2>
                <button type="button" className="mobile-controls-close" aria-label={COMMON.close} onClick={close}>×</button>
              </div>
            </div>
            <div className="mobile-controls-scroll">
              {visible.map(group => {
                const multipleValues = Array.isArray(group.value) ? group.value : [];
                const defaults = Array.isArray(group.defaultValue) ? group.defaultValue : [];
                return (
                  <fieldset className="mobile-controls-group" key={group.heading}>
                    <legend>{group.heading}</legend>
                    <div className={`mobile-controls-rows${group.columns === 2 ? ' mobile-controls-rows--two' : ''}`}>
                      {group.mode !== 'single' && group.allLabel && (
                        <button type="button" className="mobile-controls-row mobile-controls-row--all" aria-pressed={sameValues(multipleValues, defaults)} onClick={() => group.onChange(defaults)}>
                          <span>{group.allLabel}</span><span className="mobile-controls-tick" aria-hidden="true">✓</span>
                        </button>
                      )}
                      {group.options.map(option => {
                        const pressed = group.mode === 'single' ? group.value === option.id : multipleValues.includes(option.id);
                        return (
                          <button type="button" className="mobile-controls-row" aria-pressed={pressed} key={option.id} onClick={() => group.mode === 'single' ? group.onChange(option.id) : updateMultiple(group, option.id)}>
                            <span>{option.label}</span><span className="mobile-controls-tick" aria-hidden="true">✓</span>
                          </button>
                        );
                      })}
                    </div>
                  </fieldset>
                );
              })}
            </div>
            <div className="mobile-controls-footer">
              <button type="button" className="mobile-controls-reset" onClick={reset}>{MOBILE_CONTROLS.reset}</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={close}>{COMMON.done}</button>
            </div>
          </section>
          <div className="mobile-page-controls">
            <button type="button" className="mobile-controls-trigger" onClick={close} aria-expanded="true">
              {label || MOBILE_CONTROLS.filterLabel(activeCount)}
              <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 4 4 4 4-4" /></svg>
            </button>
          </div>
        </dialog>, document.body
      )}
    </>
  );
}
