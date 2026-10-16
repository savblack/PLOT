/* The viewer's Home layout, read from their profile and written back through
 * updateProfile. Optimistic: the page re-flows the moment they move a shelf;
 * a failed write puts the previous layout back and reports it. Persistence is
 * useProfileJson; the rules are homeLayout.js.
 */
import { useCallback } from 'react';
import { updateProfile } from './profile.js';
import { useProfileJson } from './useProfileJson.js';
import {
  addHomePin, defaultHomeLayout, isDefaultHomeLayout, moveHomeSection, normalizeHomeLayout,
  nudgeHomePin, nudgeHomeSection, removeHomePin, setHomeSectionVisible,
} from './homeLayout.js';

const save = (userId, value) => updateProfile({ userId, patch: { home_layout: value } });

/**
 * @param {{ userId?: string | null, saved?: unknown, onPersisted?: () => void }} args
 *   saved: profile.home_layout as loaded. onPersisted: called after a
 *   successful write so the caller can refresh its profile copy.
 */
export function useHomeLayout({ userId, saved, onPersisted } = {}) {
  const { value, isDefault, saving, error, update, reset } = useProfileJson({
    userId, save, saved, normalize: normalizeHomeLayout, isDefault: isDefaultHomeLayout, defaults: defaultHomeLayout, onPersisted,
  });

  const move = useCallback((id, toIndex) => update(l => moveHomeSection(l, id, toIndex)), [update]);
  const nudge = useCallback((id, delta) => update(l => nudgeHomeSection(l, id, delta)), [update]);
  const setVisible = useCallback((id, visible) => update(l => setHomeSectionVisible(l, id, visible)), [update]);
  const pin = useCallback((target) => update(l => addHomePin(l, target)), [update]);
  const unpin = useCallback((target) => update(l => removeHomePin(l, target)), [update]);
  const nudgePin = useCallback((target, delta) => update(l => nudgeHomePin(l, target, delta)), [update]);

  return { layout: value, isDefault, saving, error, move, nudge, setVisible, pin, unpin, nudgePin, reset };
}
