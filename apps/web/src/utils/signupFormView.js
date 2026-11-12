// When signup_form_viewed may fire.
//
// From 7 to 12 November 2026 a crawler opened /save links from title pages,
// was redirected to /signup and fired signup_form_viewed on every load: about
// 2,250 views from 2,120 "people" in six days, against roughly 45 real ones.
// Those browsers present as ordinary desktop Chrome 148 to 151, so no user-agent
// rule catches them, and they never touch the page: no click, no key, no
// $pageleave. Firing on mount counted every one of them as a person who saw
// the form, which turned views-to-starts into a meaningless ratio.
//
// So the view now waits for the first trusted, visible interaction with the
// page: a pointer, touch, wheel, or key event the browser itself produced
// while the tab was showing. The Web Vitals opt-in uses the same rule (see
// lib/webVitals.js). `scroll` and `focusin` are left out on purpose: a script
// can cause both, and the browser still marks them trusted.
export const SIGNUP_VIEW_INTERACTIONS = Object.freeze(['pointerdown', 'pointermove', 'touchstart', 'wheel', 'keydown']);

export function isHumanInteraction(event, visibilityState = typeof document === 'undefined' ? '' : document.visibilityState) {
  return Boolean(event?.isTrusted) && visibilityState === 'visible';
}

/**
 * Call `onView(eventType)` once, on the first human interaction with `target`.
 * Returns a cleanup that stops listening; calling it after the view is a no-op.
 *
 * @param {{ onView: (trigger: string) => void, target?: EventTarget, isHuman?: (event: Event) => boolean }} options
 */
export function watchForHumanView({ onView, target = typeof window === 'undefined' ? undefined : window, isHuman = isHumanInteraction } = {}) {
  if (!target?.addEventListener || typeof onView !== 'function') return () => {};
  let done = false;
  const stop = () => {
    for (const name of SIGNUP_VIEW_INTERACTIONS) target.removeEventListener(name, handle, true);
  };
  function handle(event) {
    if (done || !isHuman(event)) return;
    done = true;
    stop();
    onView(event.type);
  }
  for (const name of SIGNUP_VIEW_INTERACTIONS) {
    target.addEventListener(name, handle, { capture: true, passive: true });
  }
  return () => {
    done = true;
    stop();
  };
}
