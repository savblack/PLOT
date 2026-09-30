import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useUndoToast } from '@plot/core/undo.js';
import { UNDO } from '@plot/core/copy/undo.js';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../lib/tabBar';

/**
 * The undo toast, mobile's half of web's UndoToast.jsx. The logic (what can
 * be undone, the countdown, the outcome line) is useUndoToast in core.
 *
 * Mounted twice, because the title panel is an RN Modal and draws over
 * everything else: once at the root above the floating tab bar ('tabs'), and
 * once inside the panel ('panel'). The root one steps aside while the panel
 * is open, so an undo offered from the panel shows where the finger is.
 */
export default function UndoToast({ placement = 'tabs' }: { placement?: 'tabs' | 'panel' }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { profile } = useAppData();
  const { state: panel } = useMediaPanel();
  const toast = useUndoToast({ region: profile?.region });

  const panelOpen = !!panel.itemId;
  if (!toast.visible || (placement === 'tabs' && panelOpen)) return null;

  const bottom = placement === 'tabs'
    ? tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + spacing.sm
    : insets.bottom + spacing.md;

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom }]}>
      <View
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        onTouchStart={toast.pause}
        onTouchEnd={toast.resume}
        onTouchCancel={toast.resume}
        style={[
          styles.toast,
          {
            backgroundColor: colors.surfaceRaised,
            borderColor: toast.failed ? colors.dangerBorder : colors.borderStrong,
          },
        ]}
      >
        <Text style={[styles.message, { color: colors.textPrimary }]}>{toast.message}</Text>
        {toast.offer ? (
          <>
            <TouchableOpacity
              onPress={toast.undo}
              style={[styles.action, { borderColor: colors.borderStrong }]}
              accessibilityRole="button"
            >
              <Text style={[styles.actionText, { color: colors.textPrimary }]}>{UNDO.button}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={toast.dismiss}
              style={styles.close}
              accessibilityRole="button"
              accessibilityLabel={UNDO.dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
                <Path d="M18 6 6 18M6 6l12 12" />
              </Svg>
            </TouchableOpacity>
          </>
        ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.lg,
    // Legibility over whatever is scrolling underneath, the same job
    // --shadow-overlay does on web.
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 6,
  },
  message: {
    flex: 1,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    lineHeight: 18,
  },
  action: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radii.pill,
  },
  actionText: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.sm,
  },
  close: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
