/* The viewer's Home layout, read from their profile and written back through
 * updateProfile. Optimistic: the page re-flows the moment they move a shelf;
 * a failed write puts the previous layout back and reports it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { updateProfile } from './profile.js';
import {
  defaultHomeLayout, isDefaultHomeLayout, moveHomeSection, normalizeHomeLayout,
  nudgeHomeSection, setHomeSectionVisible,
} from './homeLayout.js';

/**
 * @param {{ userId?: string | null, saved?: unknown, onPersisted?: () => void }} args
 *   saved: profile.home_layout as loaded. onPersisted: called after a
 *   successful write so the caller can refresh its profile copy.
 * @returns {{
 *   layout: import('./homeLayout.js').HomeLayout,
 *   isDefault: boolean,
 *   saving: boolean,
 *   error: any,
 *   move: (id: string, toIndex: number) => void,
 *   nudge: (id: string, delta: -1 | 1) => void,
 *   setVisible: (id: string, visible?: boolean) => void,
 *   reset: () => void,
 * }}
 */
export function useHomeLayout({ userId, saved, onPersisted } = {}) {
  const [layout, setLayout] = useState(() => normalizeHomeLayout(saved));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const pending = useRef(0);
  const savedKey = JSON.stringify(saved ?? null);

  // Another device changed it: adopt the server's copy unless a write of ours
  // is still in flight, in which case ours is newer.
  useEffect(() => {
    if (pending.current > 0) return;
    setLayout(normalizeHomeLayout(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- compare by value
  }, [savedKey]);

  const commit = useCallback((next) => {
    setLayout((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      if (!userId) return resolved;
      const previous = current;
      pending.current += 1;
      setSaving(true);
      setError(null);
      const patch = isDefaultHomeLayout(resolved) ? null : resolved;
      updateProfile({ userId, patch: { home_layout: patch } }).then(({ error: writeError }) => {
        pending.current -= 1;
        if (pending.current === 0) setSaving(false);
        if (writeError) { setError(writeError); setLayout(previous); return; }
        onPersisted?.();
      });
      return resolved;
    });
  }, [userId, onPersisted]);

  const move = useCallback((id, toIndex) => commit(l => moveHomeSection(l, id, toIndex)), [commit]);
  const nudge = useCallback((id, delta) => commit(l => nudgeHomeSection(l, id, delta)), [commit]);
  const setVisible = useCallback((id, visible) => commit(l => setHomeSectionVisible(l, id, visible)), [commit]);
  const reset = useCallback(() => commit(defaultHomeLayout()), [commit]);

  return { layout, isDefault: isDefaultHomeLayout(layout), saving, error, move, nudge, setVisible, reset };
}
