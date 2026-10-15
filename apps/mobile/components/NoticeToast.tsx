// Mobile host for NOTICE_EVENT. Web's NoticeToast.jsx is the other half.
// The title panel is a modal, so this mounts twice, the same way UndoToast
// does: at the root, and inside the panel. The root one steps aside while
// the panel is open.
import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { on, NOTICE_EVENT } from '@plot/core/events.js';
import { useTheme } from '../contexts/ThemeContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../lib/tabBar';

const SHOW_MS = 4000;

type Notice = { message: string; at: number };

export default function NoticeToast({ placement = 'tabs' }: { placement?: 'tabs' | 'panel' }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { state: panel } = useMediaPanel();
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => on(NOTICE_EVENT, (payload: { message?: string } | null | undefined) => {
    if (payload?.message) setNotice({ message: payload.message, at: Date.now() });
  }), []);

  useEffect(() => {
    if (!notice) return undefined;
    const id = setTimeout(() => setNotice(null), SHOW_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const panelOpen = !!panel.itemId;
  if (!notice) return null;
  if (placement === 'tabs' && panelOpen) return null;
  if (placement === 'panel' && !panelOpen) return null;

  const bottom = placement === 'tabs'
    ? tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + spacing.sm
    : insets.bottom + spacing.md;

  return (
    <View pointerEvents="none" style={[styles.wrap, { bottom }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        style={[styles.toast, { backgroundColor: colors.surfaceRaised, borderColor: colors.borderStrong }]}
      >
        <Text style={[styles.message, { color: colors.textPrimary }]}>{notice.message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    alignItems: 'stretch',
  },
  toast: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  message: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
});
