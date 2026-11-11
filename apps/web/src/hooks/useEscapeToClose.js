// Escape closes an overlay (a menu or a sheet) and hands focus back to
// whatever opened it. DOM-only (document listeners and focus), so it stays in
// the web app: React Native has no Escape key, and mobile's sheets close with
// the system back gesture.
import { useEffect, useRef, useState } from 'react';

/** Open overlays that use this hook, oldest first. Only the last one answers Escape. */
const openOverlays = [];

const DIALOGS = '[role="dialog"], [role="alertdialog"]';
const EDITABLE = 'input, textarea, select, [contenteditable="true"]';

/** A visible dialog that is not this overlay and was added to the page after it. */
function coveredByAnotherDialog(root) {
  if (!root) return false;
  return [...document.querySelectorAll(DIALOGS)].some(dialog =>
    dialog !== root
    && !dialog.contains(root)
    && !root.contains(dialog)
    && dialog.getClientRects().length > 0
    && (root.compareDocumentPosition(dialog) & Node.DOCUMENT_POSITION_FOLLOWING));
}

/**
 * @param {boolean} active  whether the overlay is open
 * @param {() => void} onClose
 * @param {{
 *   rootRef?: { current: Element | null },
 *   getTrigger?: () => (HTMLElement | null | undefined),
 * }} [options]  rootRef: the overlay's own element. getTrigger: what to focus
 *   after closing. Without it, focus returns to whatever had it when the
 *   component mounted, which is right for a sheet mounted only while open.
 */
export function useEscapeToClose(active, onClose, { rootRef, getTrigger } = {}) {
  // Read during the first render, before anything inside the sheet autofocuses.
  const [opener] = useState(() => (typeof document === 'undefined' ? null : document.activeElement));
  const latest = useRef({ onClose, getTrigger });
  useEffect(() => { latest.current = { onClose, getTrigger }; });

  useEffect(() => {
    if (!active) return undefined;
    const entry = {};
    openOverlays.push(entry);

    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // Only the topmost overlay closes: not one underneath another of ours,
      // and not one underneath a dialog that handles Escape itself.
      if (openOverlays[openOverlays.length - 1] !== entry) return;
      const root = rootRef?.current ?? null;
      if (coveredByAnotherDialog(root)) return;
      // An inline editor elsewhere on the page (rename a list, edit a name)
      // cancels itself with Escape. Leave that key to it.
      const target = event.target instanceof Element ? event.target : null;
      if (target?.matches(EDITABLE) && !(root && root.contains(target))) return;

      event.preventDefault();
      // Capture phase + stopPropagation: a menu inside a panel closes the
      // menu, and the panel's own document listener never sees the key.
      event.stopPropagation();
      const trigger = latest.current.getTrigger ? latest.current.getTrigger() : opener;
      latest.current.onClose();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const index = openOverlays.indexOf(entry);
      if (index !== -1) openOverlays.splice(index, 1);
    };
  }, [active, rootRef, opener]);
}
