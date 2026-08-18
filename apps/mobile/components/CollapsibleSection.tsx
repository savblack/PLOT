/**
 * Collapsible section banner — the RN counterpart of web's
 * apps/web/src/components/CollapsibleSection.jsx. Chevron, label, optional
 * count, optional right-hand slot, over an animated body.
 *
 * Open state persists per `id` so a collapsed group stays collapsed across tab
 * switches and app restarts, matching web. The stored value is seeded
 * synchronously from lib/sectionOpenState's in-memory cache (hydrated once at
 * app start) — reading AsyncStorage here would make every section flash open
 * before collapsing.
 *
 * Supports the same controlled/uncontrolled split as web: pass `open` to drive
 * it from outside (expand/collapse-all), omit it to let the section own and
 * persist its own state. A controlled section still writes on toggle, so the
 * bulk control's result is remembered too.
 */
import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, LayoutAnimation, Platform, UIManager } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing } from '../lib/tokens';
import { getSectionOpen, setSectionOpen } from '../lib/sectionOpenState';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function CollapsibleSection({
  id, label, count, defaultOpen = true, open, onOpenChange, headerRight, children,
}: {
  id: string;
  label: string;
  count?: number;
  defaultOpen?: boolean;
  /** Controlled mode: drives the section from outside (expand/collapse-all). */
  open?: boolean;
  onOpenChange?: (next: boolean) => void;
  headerRight?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [storedOpen, setStoredOpen] = useState(() => getSectionOpen(id, defaultOpen));
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : storedOpen;

  const toggle = useCallback(() => {
    const next = !isOpen;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSectionOpen(id, next);
    if (!isControlled) setStoredOpen(next);
    onOpenChange?.(next);
  }, [id, isControlled, isOpen, onOpenChange]);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <TouchableOpacity
          style={styles.headToggle}
          onPress={toggle}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
          accessibilityLabel={label}
        >
          <Svg
            width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: [{ rotate: isOpen ? '90deg' : '0deg' }] }}
          >
            <Polyline points="9,18 15,12 9,6" />
          </Svg>
          <Text style={styles.label}>{label}</Text>
          {count !== undefined && <Text style={styles.count}>{count}</Text>}
        </TouchableOpacity>
        {headerRight ? <View style={styles.headActions}>{headerRight}</View> : null}
      </View>
      {isOpen ? <View>{children}</View> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  section: { marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center' },
  headToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, gap: spacing.sm },
  headActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  count: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
});
