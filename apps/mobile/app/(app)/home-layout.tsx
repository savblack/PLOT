/**
 * Customize Home — /(app)/home-layout (mirrors web's HomeLayoutSheet). One row
 * per shelf in the viewer's order with up/down buttons and a show/hide switch,
 * plus Reset to default. Rules and persistence are shared with web in
 * @plot/core/homeLayout.js and useHomeLayout.js. Mobile has no drag: the
 * buttons are the whole affordance, as on web for keyboard and touch.
 */
import { useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useHomeLayout } from '@plot/core/useHomeLayout.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import { HOME_SHELF_LABELS } from '../../lib/homeShelves';
import { Palette, fontFamily, fontSize, radii, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

const C = DISCOVER_VIEW.customize;

function Chevron({ up, color }: { up?: boolean; color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d={up ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6'} />
    </Svg>
  );
}

export default function HomeLayoutScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, profile, refreshProfile } = useAppData();
  const { layout, isDefault, error, nudge, setVisible, reset } = useHomeLayout({ userId, saved: profile?.home_layout, onPersisted: refreshProfile });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>{C.title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        <Text style={styles.intro}>{C.bodyArrows}</Text>
        {error ? <Text style={styles.error} accessibilityRole="alert">{C.saveError}</Text> : null}
        <View style={styles.list}>
          {layout.order.map((id, index) => {
            const label = HOME_SHELF_LABELS[id] ?? id;
            const hidden = layout.hidden.includes(id);
            const first = index === 0;
            const last = index === layout.order.length - 1;
            return (
              <View key={id} style={styles.row}>
                <View style={styles.labelWrap}>
                  <Text style={[styles.label, hidden && styles.labelHidden]} numberOfLines={1}>{label}</Text>
                  {hidden ? <Text style={styles.tag}>{C.hiddenTag}</Text> : null}
                </View>
                <TouchableOpacity style={[styles.nudge, first && styles.nudgeOff]} disabled={first} onPress={() => nudge(id, -1)} accessibilityRole="button" accessibilityLabel={C.moveUp(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Chevron up color={colors.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.nudge, last && styles.nudgeOff]} disabled={last} onPress={() => nudge(id, 1)} accessibilityRole="button" accessibilityLabel={C.moveDown(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Chevron color={colors.textSecondary} />
                </TouchableOpacity>
                <Switch value={!hidden} onValueChange={on => setVisible(id, on)} trackColor={{ true: colors.accent }} accessibilityLabel={hidden ? C.show(label) : C.hide(label)} />
              </View>
            );
          })}
        </View>
        <TouchableOpacity style={[styles.reset, isDefault && styles.resetOff]} disabled={isDefault} onPress={reset} accessibilityRole="button" accessibilityState={{ disabled: isDefault }}>
          <Text style={styles.resetText}>{C.reset}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 4 },
  topBarTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.lg },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.md },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  labelWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flexShrink: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  labelHidden: { color: colors.textMuted },
  tag: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
  nudge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  nudgeOff: { opacity: 0.3 },
  reset: { marginTop: spacing.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  resetOff: { opacity: 0.4 },
  resetText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
