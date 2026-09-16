import { useState } from 'react';

/* Multi-select state for one list: which ids are ticked and whether the
   select circles are showing. Shared by every list on My Lists and by the
   covers grid itself. */
export function useSelection() {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const toggle = (id) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const start = () => setEditMode(true);
  const exit  = () => { setEditMode(false); setSelected(new Set()); };
  return { editMode, selected, toggle, start, exit };
}
