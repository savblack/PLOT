// Two small helpers for pop-ups built on ResponsiveDialog. DOM-only (focus and
// the dialog element), so they stay in the web app.
import { useCallback, useEffect, useRef } from 'react';

/**
 * An onClose for ResponsiveDialog whose identity never changes.
 *
 * ResponsiveDialog re-runs its open effect whenever onClose changes, and that
 * effect hands focus back to whatever opened the dialog. A parent that
 * re-renders while its dialog is open (a reorder that saves, a list that
 * reloads) would pull focus out of the dialog on every render. This calls the
 * latest onClose instead, and does nothing while `blocked` (a save in flight).
 *
 * @param {() => void} onClose
 * @param {boolean} [blocked]
 * @returns {() => void}
 */
export function useStableClose(onClose, blocked = false) {
  const latest = useRef({ onClose, blocked });
  useEffect(() => { latest.current = { onClose, blocked }; });
  return useCallback(() => {
    if (!latest.current.blocked) latest.current.onClose();
  }, []);
}

/**
 * Focus the dialog's first button (its header's Cancel) when it opens, and
 * again whenever `key` changes. `ref` is any element inside the dialog. This
 * runs after ResponsiveDialog has noted where focus came from, so closing
 * still returns focus there.
 *
 * @param {{ current: Element | null }} ref
 * @param {unknown} [key]
 */
export function useFocusCancel(ref, key) {
  useEffect(() => {
    const button = ref.current?.closest('[role="dialog"]')?.querySelector('button');
    if (button instanceof HTMLElement) button.focus();
  }, [ref, key]);
}
