/**
 * "Watched. Rate it?" with five stars, shown above the tab bar when the title
 * panel closes on a fresh mark that got no rating (lib/ratePrompt.ts). One of
 * the three rating prompts; the Home card (RateCard) and the next-morning
 * notification are the other two. A star tap rates in place; the toast then
 * confirms and goes. It leaves on its own after a short while.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ratingToStars } from '@plot/core/ratings.js';
import { RATE_PROMPT } from '@plot/core/copy/ratePrompt.js';
import { UNDO } from '@plot/core/copy/undo.js';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../lib/tabBar';
import { cancelRateReminder, clearPendingRate, getPendingRate, subscribePendingRate, type RateTarget } from '../lib/ratePrompt';
import Stars from './Stars';

const SHOW_MS = 8000;
const RATED_MS = 1500;

export default function RateToast() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { history } = useAppData();
  const { state: panel } = useMediaPanel();
  const pending = useSyncExternalStore(subscribePendingRate, getPendingRate, getPendingRate);

  const [shown, setShown] = useState<RateTarget | null>(null);
  const [rated, setRated] = useState(0);
  const [busy, setBusy] = useState(false);
  const wasOpen = useRef<number | null>(null);

  // Show when the panel that held the pending title closes and it is still unrated.
  useEffect(() => {
    const open = panel.itemId;
    const closedId = wasOpen.current;
    wasOpen.current = open;
    if (open != null || closedId == null || !pending || pending.tmdbId !== closedId) return;
    const entry = history.entries?.find((e: { tmdb_id: number; media_type: string }) => e.tmdb_id === pending.tmdbId && e.media_type === pending.mediaType);
    if (!entry || entry.rating != null) { clearPendingRate(pending.tmdbId); return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the panel closing is the external event this toast answers
    setRated(0);
    setShown(pending);
    clearPendingRate(pending.tmdbId);
  }, [panel.itemId, pending, history.entries]);

  // Leave on its own.
  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), rated ? RATED_MS : SHOW_MS);
    return () => clearTimeout(t);
  }, [shown, rated]);

  if (!shown) return null;

  const pick = async (value: number) => {
    if (busy) return;
    setBusy(true);
    const entry = history.entries?.find((e: { tmdb_id: number; media_type: string }) => e.tmdb_id === shown.tmdbId && e.media_type === shown.mediaType);
    const ok = entry && await history.updateEntry(shown.tmdbId, {
      rating: value, note: entry.note ?? null, dnf: !!entry.dnf, watched_at: entry.watched_at,
    }, shown.mediaType);
    setBusy(false);
    if (ok) {
      setRated(value);
      void cancelRateReminder(shown);
    }
  };

  const bottom = tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + spacing.sm;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}
      >
        <Text style={[styles.message, { color: colors.textPrimary }]} numberOfLines={1}>
          {rated ? RATE_PROMPT.rated(ratingToStars(rated)) : RATE_PROMPT.toast}
        </Text>
        {!rated && (
          <Stars value={0} disabled={busy} label={RATE_PROMPT.question(shown.title)} onPick={pick} starWidth={26} size={20} />
        )}
        <TouchableOpacity
          onPress={() => setShown(null)}
          style={styles.close}
          accessibilityRole="button"
          accessibilityLabel={UNDO.dismiss}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
            <Path d="M18 6 6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: spacing.md, right: spacing.md, alignItems: 'stretch' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    // Legibility over whatever scrolls underneath, as UndoToast.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  message: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, lineHeight: 18 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
