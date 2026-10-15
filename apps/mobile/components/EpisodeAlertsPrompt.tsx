/**
 * One-time prompt after the first forward episode tick. Same decision as web
 * (packages/core/episodeAlertsPrompt.js). The title panel is a modal, so the
 * toast also mounts inside it, the same way UndoToast does. Alerts are free.
 * This does not open checkout.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EPISODE_ALERTS as T } from '@plot/core/copy/episodeAlerts.js';
import { COMMON } from '@plot/core/copy/common.js';
import { UNDO } from '@plot/core/copy/undo.js';
import {
  episodeAlertsPromptStorageKey,
  useEpisodeAlertsPromptActions,
  useEpisodeAlertsPromptController,
} from '@plot/core/episodeAlertsPrompt.js';
import { fontFamily, fontSize, radii, spacing } from '../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../lib/tabBar';
import { track, EVENTS } from '../lib/analytics';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';

const storage = {
  readSeen: async (id: string) => (await AsyncStorage.getItem(episodeAlertsPromptStorageKey(id))) === '1',
  writeSeen: async (id: string) => { await AsyncStorage.setItem(episodeAlertsPromptStorageKey(id), '1'); },
};

/** Mount once, under AppDataProvider. Draws nothing. */
export function EpisodeAlertsPromptController() {
  const { userId } = useAppData();
  useEpisodeAlertsPromptController(userId, storage);
  return null;
}

export function EpisodeAlertsPromptToast({ placement = 'tabs' }: { placement?: 'tabs' | 'panel' }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAppData();
  const { state: panel } = useMediaPanel();
  const { offer, busy, failed, accept, dismiss } = useEpisodeAlertsPromptActions(userId);
  // Clear the undo toast, which the same tick also offers.
  const bottom = useMemo(
    () => (placement === 'tabs'
      ? tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + spacing.sm
      : insets.bottom + spacing.md) + 72,
    [placement, insets.bottom],
  );

  if (!offer) return null;
  if (placement === 'tabs' && panel.itemId) return null;

  const turnOn = async () => {
    const result = await accept();
    if (result.ok) track(EVENTS.EPISODE_ALERTS_TOGGLED, { tmdb_id: result.tmdbId, on: true });
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: failed ? colors.dangerBorder : colors.borderStrong }]}
      >
        <Text style={[styles.message, { color: colors.textPrimary }]}>{failed ? T.error : T.promptQuestion}</Text>
        <TouchableOpacity
          onPress={turnOn}
          disabled={busy}
          style={[styles.action, { borderColor: colors.borderStrong }]}
          accessibilityRole="button"
        >
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>{busy ? COMMON.saving : T.promptAction}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={dismiss}
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
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  message: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18 },
  action: { paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: StyleSheet.hairlineWidth, borderRadius: radii.pill },
  actionText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm },
  close: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
