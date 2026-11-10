// The open panel (a title or a collection) and its address.
//
// The panel has an address: `?panel=movie-123` on whatever page is behind it
// (@plot/core/panelLink.js). Opening pushes a history entry, so the browser's
// Back button closes the panel, or returns from a film to the collection it
// was opened from. The panel used to live only in App state, and Back changed
// the page behind it while the panel stayed open (design audit pick 1.1 A).
//
// Web only: this is the browser's history and react-router. Mobile presents
// its panel as a native sheet with its own back gesture; the link format it
// would read is in core.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { parsePanelParam, searchWithPanel, samePanel } from '@plot/core/panelLink.js';

/**
 * @param {{ onView?: (id: number, type: string, source?: string) => void }} [options]
 *   onView: a panel was opened by a click (with the surface's source) or by
 *   arriving on a link (source "link"). Back and Forward do not count.
 * @returns {{
 *   panelItem: { id: number, type: string, initialListOpen?: boolean } | null,
 *   panelClosing: boolean,
 *   openPanel: (id: number | string, type: string, source?: string, options?: { initialListOpen?: boolean }) => void,
 *   closePanel: () => void,
 *   hidePanel: () => void,
 * }} hidePanel runs the close animation without touching the address, for a
 *   caller that is about to navigate somewhere else itself.
 */
export function usePanelRoute({ onView } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const [panelItem, setPanelItem] = useState(null);
  const [panelClosing, setPanelClosing] = useState(false);
  const panelItemRef = useRef(null);
  const panelClosingRef = useRef(false);
  const onViewRef = useRef(onView);
  useEffect(() => { onViewRef.current = onView; });
  const navigationType = useNavigationType();
  const locationRef = useRef(location);
  useEffect(() => { locationRef.current = location; });
  const closeTimer = useRef(null);
  const firstLocation = useRef(true);
  // Back and Forward, heard directly. The router applies a new address in a
  // transition, so a Back pressed within a few milliseconds of opening a
  // title can land before the open was ever committed: the router then ends
  // up on the address it already had and reports no change, while the panel
  // has already switched. Counting the event makes the effect below run
  // anyway and put the two back in step.
  const [popCount, setPopCount] = useState(0);
  const popped = useRef(false);
  useEffect(() => {
    const onPop = () => { popped.current = true; setPopCount(n => n + 1); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // The refs are written here as well as in the effect further down, so the
  // location effect reads the new panel in the same render that opened it.
  const showPanel = useCallback((item) => {
    clearTimeout(closeTimer.current);
    panelItemRef.current = item;
    panelClosingRef.current = false;
    setPanelItem(item);
    setPanelClosing(false);
  }, []);

  // The close animation only. It does not touch the address.
  const hidePanel = useCallback(() => {
    panelClosingRef.current = true;
    setPanelClosing(true);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      panelItemRef.current = null;
      panelClosingRef.current = false;
      setPanelItem(null);
      setPanelClosing(false);
    }, 280);
  }, []);

  const openPanel = useCallback((id, type, source, options) => {
    const target = { id: Number(id), type };
    const loc = locationRef.current;
    const current = parsePanelParam(loc.search);
    showPanel(options?.initialListOpen ? { ...target, initialListOpen: true } : target);
    onViewRef.current?.(target.id, type, source);
    if (samePanel(current, target)) return;
    // How many panel entries sit on top of the page, so closing can step back
    // over all of them (a collection, then a film from it) in one go.
    const depth = current ? (loc.state?.panelDepth ?? 0) + 1 : 1;
    navigate(
      { pathname: loc.pathname, search: searchWithPanel(loc.search, target), hash: loc.hash },
      { state: { ...(loc.state || {}), panelDepth: depth } },
    );
  }, [navigate, showPanel]);

  const closePanel = useCallback(() => {
    const loc = locationRef.current;
    hidePanel();
    if (!parsePanelParam(loc.search)) return;
    const depth = loc.state?.panelDepth;
    // Opened from this page: step back to it, so Forward reopens the panel
    // and the history holds no duplicate of the page.
    if (Number.isInteger(depth) && depth > 0) { navigate(-depth); return; }
    // Arrived by link, or the panel was carried across a page change: there
    // is no entry of ours to go back to, so drop it from this one.
    navigate({ pathname: loc.pathname, search: searchWithPanel(loc.search, null), hash: loc.hash }, { replace: true, state: loc.state });
  }, [hidePanel, navigate]);

  // Keep the panel and the address in step.
  useEffect(() => {
    const target = parsePanelParam(location.search);
    const first = firstLocation.current;
    firstLocation.current = false;
    const wentBackOrForward = popped.current || navigationType === 'POP';
    popped.current = false;
    if (target) {
      const shown = panelItemRef.current;
      if (samePanel(shown, target) && !panelClosingRef.current) return;
      // Reached by link (first load) or by Back/Forward. Only a link counts
      // as a view; stepping through history is not a new one.
      showPanel(target);
      if (first) onViewRef.current?.(target.id, target.type, 'link');
      return;
    }
    if (!panelItemRef.current || panelClosingRef.current) return;
    // The address no longer names a panel. Back/Forward means close it. A
    // page that moved or rewrote its own query (the panel can stay docked
    // while you browse) keeps the panel, so put its address back.
    if (wentBackOrForward) { hidePanel(); return; }
    const { panelDepth: _depth, ...rest } = location.state || {};
    navigate(
      { pathname: location.pathname, search: searchWithPanel(location.search, panelItemRef.current), hash: location.hash },
      { replace: true, state: Object.keys(rest).length ? rest : null },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on address changes and on Back/Forward; panel state is read through refs
  }, [location.key, location.search, location.pathname, popCount]);
  useEffect(() => () => clearTimeout(closeTimer.current), []);

  return { panelItem, panelClosing, openPanel, closePanel, hidePanel };
}
