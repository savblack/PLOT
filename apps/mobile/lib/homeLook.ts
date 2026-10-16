// Home's Look setting on mobile (profile.ui_prefs.density; shared with web in
// @plot/core/uiPrefs.js). Compact draws the poster rails' cards smaller so
// more of a shelf shows. Card style "list" is web only for now: mobile's rails
// are horizontal poster lists, and a row layout for each of them is its own
// piece of work (tracked as a parity issue).
import { normalizeUiPrefs } from '@plot/core/uiPrefs.js';
import { useAppData } from '../contexts/AppDataContext';

export const COMPACT_POSTER_SCALE = 0.82;

/** 1 for comfy, COMPACT_POSTER_SCALE for compact. Multiply a poster card's width by it. */
export function useHomePosterScale(): number {
  const { profile } = useAppData();
  return normalizeUiPrefs(profile?.ui_prefs).density === 'compact' ? COMPACT_POSTER_SCALE : 1;
}
