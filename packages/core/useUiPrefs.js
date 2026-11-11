/* The viewer's density, card style and sidebar order, read from profile.ui_prefs
 * and written back through updateProfile. Same shape as useHomeLayout; the
 * rules are uiPrefs.js.
 */
import { useCallback } from 'react';
import { updateProfile } from './profile.js';
import { useProfileJson } from './useProfileJson.js';
import {
  defaultUiPrefs, isDefaultUiPrefs, moveMyListsSection, moveSidebarItem, normalizeUiPrefs, nudgeMyListsSection, nudgeSidebarItem,
  resetMyListsOrder, resetSidebar, setCardStyle, setDensity, setMyListsCollapsed,
} from './uiPrefs.js';

const save = (userId, value) => updateProfile({ userId, patch: { ui_prefs: value } });

/**
 * @param {{ userId?: string | null, saved?: unknown, onPersisted?: () => void }} args
 *   saved: profile.ui_prefs as loaded.
 */
export function useUiPrefs({ userId, saved, onPersisted } = {}) {
  const { value, isDefault, saving, error, update, reset } = useProfileJson({
    userId, save, saved, normalize: normalizeUiPrefs, isDefault: isDefaultUiPrefs, defaults: defaultUiPrefs, onPersisted,
  });

  const chooseDensity = useCallback((density) => update(p => setDensity(p, density)), [update]);
  const chooseCardStyle = useCallback((style) => update(p => setCardStyle(p, style)), [update]);
  const nudgeSidebar = useCallback((currentIds, id, delta) => update(p => nudgeSidebarItem(p, currentIds, id, delta)), [update]);
  const moveSidebar = useCallback((currentIds, id, toIndex) => update(p => moveSidebarItem(p, currentIds, id, toIndex)), [update]);
  const resetSidebarOrder = useCallback(() => update(p => resetSidebar(p)), [update]);
  const nudgeMyLists = useCallback((currentIds, id, delta) => update(p => nudgeMyListsSection(p, currentIds, id, delta)), [update]);
  const moveMyLists = useCallback((currentIds, id, toIndex) => update(p => moveMyListsSection(p, currentIds, id, toIndex)), [update]);
  const toggleMyListsCollapsed = useCallback((id) => update(p => setMyListsCollapsed(p, id)), [update]);
  const resetMyLists = useCallback(() => update(p => resetMyListsOrder(p)), [update]);

  return {
    prefs: value, isDefault, saving, error, chooseDensity, chooseCardStyle, nudgeSidebar, moveSidebar, resetSidebarOrder, reset,
    nudgeMyLists, moveMyLists, toggleMyListsCollapsed, resetMyLists,
  };
}
