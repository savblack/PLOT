// Web-only: native modals use a registry because they have no DOM to observe.
import { useEffect, useState } from 'react';

// ResponsiveDialog, the title/person panels, native <dialog>, and the drawer
// cover the app. Include aria-modal for overlays outside the shared base.
const OVERLAY_SELECTOR = '[aria-modal="true"], dialog[open], .panel-overlay, .nav-drawer-overlay';

export function otherOverlayOpen() {
  return typeof document !== 'undefined' && !!document.querySelector(OVERLAY_SELECTOR);
}

/** Re-check the pending trial request when the last competing overlay closes. */
export function useOtherOverlayOpen() {
  const [open, setOpen] = useState(otherOverlayOpen);
  useEffect(() => {
    const observer = new MutationObserver(() => setOpen(otherOverlayOpen()));
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-modal', 'open'] });
    // A portal may have mounted between the initial render and this observer.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize with the current DOM before deciding on the prompt
    setOpen(otherOverlayOpen());
    return () => observer.disconnect();
  }, []);
  return open;
}
