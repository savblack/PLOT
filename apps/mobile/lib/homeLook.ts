// Home's Look setting on mobile (profile.ui_prefs; shared with web in
// @plot/core/uiPrefs.js).
//   density    compact draws the poster rails' cards smaller (poster width)
//   cardStyle  list draws the poster rails as rows: a small poster beside the
//              title, capped at LIST_ROW_CAP (components/PosterRail.tsx)
// The wide backdrop cards, the platform charts and the Releases rails keep
// their own layouts in either style, as on web.
import { normalizeUiPrefs } from '@plot/core/uiPrefs.js';
import { useAppData } from '../contexts/AppDataContext';

export const COMPACT_POSTER_SCALE = 0.82;

/** The viewer's saved Look, from their profile. */
export function useHomeLook(): { scale: number; cardStyle: 'poster' | 'list' } {
  const { profile } = useAppData();
  const prefs = normalizeUiPrefs(profile?.ui_prefs);
  return { scale: prefs.density === 'compact' ? COMPACT_POSTER_SCALE : 1, cardStyle: prefs.cardStyle };
}

/** 1 for comfy, COMPACT_POSTER_SCALE for compact. Multiply a poster card's width by it. */
export function useHomePosterScale(): number {
  return useHomeLook().scale;
}
