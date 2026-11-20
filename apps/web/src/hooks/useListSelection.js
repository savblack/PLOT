import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * @typedef {Object} ListSelection
 * @property {boolean} editMode
 * @property {Set<number>} selected
 * @property {(id: number) => void} toggle
 * @property {() => void} start
 * @property {() => void} exit
 * @property {() => void} finish leave select mode and put focus back on Select
 * @property {(next: Set<number>) => void} setSelected
 * @property {(el: HTMLButtonElement | null) => void} bindToggle callback ref for the toolbar's Select button
 */

/* Select mode on a list page (ListSelection.jsx). A superset of
   useSelection(): the same editMode / selected / toggle / start / exit, plus
   setSelected for Select all and for keeping the titles that failed, Escape
   to leave, and the toolbar's Select button to hand focus back to when the
   bar closes (the bar's own buttons go with it). */
/** @returns {ListSelection} */
export function useListSelection() {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const toggleEl = useRef(/** @type {HTMLButtonElement | null} */ (null));

  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const start = () => setEditMode(true);
  const exit = useCallback(() => { setEditMode(false); setSelected(new Set()); }, []);
  const finish = useCallback(() => { exit(); toggleEl.current?.focus(); }, [exit]);
  const bindToggle = useCallback((el) => { toggleEl.current = el; }, []);

  useEffect(() => {
    if (!editMode) return undefined;
    // Bubble phase: a dialog on top (the list picker) answers Escape first and
    // stops it, so Escape there closes the dialog and leaves selecting alone.
    const onKey = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      finish();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [editMode, finish]);

  return { editMode, selected, toggle, start, exit, finish, setSelected, bindToggle };
}
