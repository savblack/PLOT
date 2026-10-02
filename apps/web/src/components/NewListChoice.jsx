// "New list" asks which kind (B1 on the smart lists canvas): a list you fill
// yourself, or a smart list that finds its own titles. A small menu under the
// button that opened it. Mobile parity: issue 1094.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import './SmartListDialog.css';

const IconList = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>;
const IconSparkle = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></svg>;

const MENU_WIDTH = 300;
const GUTTER = 16;

/**
 * @param {{
 *   anchorRef: { current: HTMLElement | null },
 *   onList: () => void,
 *   onSmart: () => void,
 *   onClose: () => void,
 * }} props
 */
export default function NewListChoice({ anchorRef, onList, onSmart, onClose }) {
  const menuRef = useRef(null);
  const [pos, setPos] = useState(null);

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(GUTTER, Math.min(rect.left, window.innerWidth - MENU_WIDTH - GUTTER));
    setPos({ top: rect.bottom + 8, left });
  }, [anchorRef]);

  useEffect(() => {
    menuRef.current?.querySelector('button')?.focus();
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); anchorRef.current?.focus(); }
    };
    const onMove = () => onClose();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [anchorRef, onClose]);

  const item = (kind, Icon, onPick) => (
    <button type="button" role="menuitem" className="smart-kind" onClick={onPick}>
      <span className="smart-kind-icon"><Icon /></span>
      <span className="smart-kind-text">
        <span className="smart-kind-title">{SMART_LISTS.kinds[kind].title}</span>
        <span className="smart-kind-body">{SMART_LISTS.kinds[kind].body}</span>
      </span>
    </button>
  );

  return createPortal(
    <div ref={menuRef} role="menu" aria-label="New list" className="smart-kind-menu"
      style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
      {item('list', IconList, onList)}
      {item('smart', IconSparkle, onSmart)}
    </div>,
    document.body,
  );
}
