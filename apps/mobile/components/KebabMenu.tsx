/**
 * "···" trigger + dropdown panel — the RN counterpart of web's
 * apps/web/src/components/KebabMenu.jsx.
 *
 * Replaces the Alert.alert action sheets mobile used for row menus. Those
 * worked, but an OS alert can't match the app's styling, reads its title as a
 * question rather than a menu, and puts destructive actions behind a different
 * interaction model than web's. This is the same affordance on both platforms.
 *
 * The full-screen dismiss catcher sits behind the panel, mirroring web's
 * click-catcher: tapping anywhere else closes the menu without also triggering
 * whatever is underneath.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';

export interface KebabMenuItem {
  label: string;
  onPress: () => void;
  danger?: boolean;
}

export default function KebabMenu({
  items, accessibilityLabel = 'Open menu',
}: {
  items: KebabMenuItem[];
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.triggerText}>···</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Dismiss catcher — mirrors web's full-screen click-catcher. */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.panel}>
            {items.map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.item}
                onPress={() => { setOpen(false); item.onPress(); }}
                activeOpacity={0.7}
                accessibilityRole="button"
              >
                <Text style={[styles.itemText, item.danger && styles.itemTextDanger]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  trigger: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs },
  triggerText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textMuted, letterSpacing: 1 },
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: {
    minWidth: 200,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  item: { paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  itemText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  itemTextDanger: { color: colors.danger },
});
