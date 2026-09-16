import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COMMON } from '../copy/common.js';
import { MOBILE_CONTROLS } from '@plot/core/copy/mobileControls.js';

// Web-only presentation: a native HTML dialog supplies modal focus handling.
// The caller owns filter/view state; these controls do not fetch or derive titles.
export default function MobilePageControls({ groups = [], options, value, onChange, label, title }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef(null);
  const trigger = useRef(null);
  const titleId = useId();
  const visible = groups.filter(group => group.options.length > 0);
  const activeCount = visible.filter(group => {
    const defaults = group.defaultValue ?? [];
    return group.value.length !== defaults.length || group.value.some(v => !defaults.includes(v));
  }).length;
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

  return (
    <>
      <span className="mobile-controls-anchor" hidden />
      {createPortal(<div className="mobile-page-controls">
        <button ref={trigger} type="button" className="mobile-controls-trigger" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
          {label || MOBILE_CONTROLS.filterLabel(activeCount)}
          <svg viewBox="0 0 12 12" aria-hidden="true"><path d="m2 8 4-4 4 4" /></svg>
        </button>
      </div>, document.body)}
      {open && createPortal(
        <dialog ref={dialog} className="mobile-controls-dialog" aria-labelledby={titleId} onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}>
          <div className="mobile-controls-sheet">
            <div className="mobile-controls-handle" aria-hidden="true" />
            <div className="mobile-controls-heading">
              <h2 id={titleId}>{title || MOBILE_CONTROLS.filters}</h2>
              <button type="button" className="mobile-controls-close" aria-label={COMMON.close} onClick={close}>×</button>
            </div>
            {options ? options.map(option => (
              <button type="button" className="mobile-controls-option" aria-pressed={value === option.id} key={option.id} onClick={() => { onChange(option.id); close(); }}>
                {option.label}<span aria-hidden="true">{value === option.id ? '✓' : ''}</span>
              </button>
            )) : <>
              <div className="mobile-controls-scroll">
              {visible.map(group => (
                <fieldset className="mobile-controls-group" key={group.heading}>
                  <legend>{group.heading}</legend>
                  <div className="mobile-controls-chips">
                    {group.allLabel && <button type="button" aria-pressed={group.value.length === (group.defaultValue ?? []).length && group.value.every(v => (group.defaultValue ?? []).includes(v))} onClick={() => group.onChange(group.defaultValue ?? [])}>{group.allLabel}</button>}
                    {group.options.map(option => <button type="button" key={option.id} aria-pressed={group.value.includes(option.id)} onClick={() => group.onChange(group.value.includes(option.id) ? group.value.filter(v => v !== option.id) : [...group.value, option.id])}>{option.label}</button>)}
                  </div>
                </fieldset>
              ))}
              </div>
              <div className="mobile-controls-footer">
                <button type="button" className="mobile-controls-reset" onClick={() => visible.forEach(group => group.onChange(group.defaultValue ?? []))}>{MOBILE_CONTROLS.reset}</button>
                <button type="button" className="btn btn-primary btn-sm" onClick={close}>{COMMON.done}</button>
              </div>
            </>}
          </div>
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
