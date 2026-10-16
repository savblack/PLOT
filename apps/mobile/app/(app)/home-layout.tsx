/**
 * Customize Home — /(app)/home-layout (mirrors web's HomeLayoutSheet).
 *   Look     density and card style (free)
 *   Pinned   shelves the viewer chose, at the top of Home (Premium)
 *   Shelves  one row per shelf in the viewer's order: up/down and show/hide
 * Rules and persistence are shared with web in @plot/core (homeLayout.js,
 * homePins.js, uiPrefs.js and their hooks). Mobile has no drag: the buttons
 * are the whole affordance, as on web for keyboard and touch.
 */
import { useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useHomeLayout } from '@plot/core/useHomeLayout.js';
import { useUiPrefs } from '@plot/core/useUiPrefs.js';
import { usePeopleFollows } from '@plot/core/usePeopleFollows.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { MAX_HOME_PINS } from '@plot/core/homeLayout.js';
import { pinLabel, pinOptions } from '@plot/core/homePins.js';
import { CARD_STYLES, UI_DENSITIES } from '@plot/core/uiPrefs.js';
import UpgradeSheet from '../../components/UpgradeSheet';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
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
  const { userId, profile, refreshProfile, customLists } = useAppData();
  const { layout, isDefault, error, nudge, setVisible, reset, pin, unpin, nudgePin } = useHomeLayout({ userId, saved: profile?.home_layout, onPersisted: refreshProfile });
  const ui = useUiPrefs({ userId, saved: profile?.ui_prefs, onPersisted: refreshProfile });
  const premium = profile != null && isPremiumProfile(profile);
  const people = usePeopleFollows(premium ? userId : null);
  const lists = customLists?.lists ?? [];
  const [picking, setPicking] = useState(false);
  const [upgrade, setUpgrade] = useState(false);
  const full = layout.pins.length >= MAX_HOME_PINS;
  const groups = pinOptions({ layout, lists, follows: people.follows });

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
        {(error || ui.error) ? <Text style={styles.error} accessibilityRole="alert">{C.saveError}</Text> : null}

        <Text style={styles.heading} accessibilityRole="header">{C.lookTitle}</Text>
        <View style={styles.segRow}>
          <Text style={styles.segLabel}>{C.densityLabel}</Text>
          <View style={styles.seg} accessibilityRole="radiogroup">
            {(UI_DENSITIES as readonly ('comfy' | 'compact')[]).map(d => {
              const on = ui.prefs.density === d;
              return (
                <TouchableOpacity key={d} style={[styles.segBtn, on && styles.segBtnOn]} onPress={() => ui.chooseDensity(d)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{C.density[d]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.segRow}>
          <Text style={styles.segLabel}>{C.cardStyleLabel}</Text>
          <View style={styles.seg} accessibilityRole="radiogroup">
            {(CARD_STYLES as readonly ('poster' | 'list')[]).map(c => {
              const on = ui.prefs.cardStyle === c;
              return (
                <TouchableOpacity key={c} style={[styles.segBtn, on && styles.segBtnOn]} onPress={() => ui.chooseCardStyle(c)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                  <Text style={[styles.segText, on && styles.segTextOn]}>{C.cardStyle[c]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={styles.heading} accessibilityRole="header">{C.pinsTitle}</Text>
        <Text style={styles.sub}>{premium ? C.pinsBody : C.pinsLocked}</Text>
        {premium && layout.pins.length === 0 ? <Text style={styles.empty}>{C.pinsEmpty}</Text> : null}
        {premium && layout.pins.length > 0 ? (
          <View style={styles.list}>
            {layout.pins.map((p: { kind: string; id: string }, index: number) => {
              const label = pinLabel(p, { lists, follows: people.follows }) ?? C.pinGone;
              return (
                <View key={`${p.kind}:${p.id}`} style={styles.row}>
                  <View style={styles.labelWrap}><Text style={styles.label} numberOfLines={1}>{label}</Text></View>
                  <TouchableOpacity style={[styles.nudge, index === 0 && styles.nudgeOff]} disabled={index === 0} onPress={() => nudgePin(p, -1)} accessibilityRole="button" accessibilityLabel={C.pinMoveUp(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Chevron up color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.nudge, index === layout.pins.length - 1 && styles.nudgeOff]} disabled={index === layout.pins.length - 1} onPress={() => nudgePin(p, 1)} accessibilityRole="button" accessibilityLabel={C.pinMoveDown(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Chevron color={colors.textSecondary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.nudge} onPress={() => unpin(p)} accessibilityRole="button" accessibilityLabel={C.unpin(label)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                    <Text style={styles.unpin}>×</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        ) : null}
        {premium && !picking ? (
          <TouchableOpacity style={[styles.reset, full && styles.resetOff]} disabled={full} onPress={() => setPicking(true)} accessibilityRole="button">
            <Text style={styles.resetText}>{full ? C.pinLimit(MAX_HOME_PINS) : C.pinAction}</Text>
          </TouchableOpacity>
        ) : null}
        {premium && picking ? (
          <View style={styles.picker}>
            {groups.length === 0 ? <Text style={styles.sub}>{C.pinNothingToPin}</Text> : null}
            {groups.map(g => (
              <View key={g.kind} style={{ gap: 2 }}>
                <Text style={styles.pickerTitle}>{g.label}</Text>
                {g.items.map(item => (
                  <TouchableOpacity key={`${item.pin.kind}:${item.pin.id}`} style={styles.pickerItem} onPress={() => { pin(item.pin); setPicking(false); }} accessibilityRole="button">
                    <Text style={styles.pickerItemText}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <TouchableOpacity style={styles.reset} onPress={() => setPicking(false)} accessibilityRole="button">
              <Text style={styles.resetText}>{C.pinCancel}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {!premium ? (
          <TouchableOpacity style={styles.reset} onPress={() => setUpgrade(true)} accessibilityRole="button">
            <Text style={styles.resetText}>{C.pinsUpgrade}</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.heading} accessibilityRole="header">{C.shelvesTitle}</Text>
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
      <UpgradeSheet
        visible={upgrade}
        reason="pins"
        onClose={() => setUpgrade(false)}
        onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)}
      />
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
  heading: { marginTop: spacing.xl, marginBottom: spacing.sm, fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  sub: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.md },
  empty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginBottom: spacing.sm },
  segRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.sm },
  segLabel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  seg: { flexDirection: 'row', padding: 3, borderRadius: radii.pill, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  segBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radii.pill },
  segBtnOn: { backgroundColor: colors.surface },
  segText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  segTextOn: { color: colors.textPrimary },
  unpin: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
  picker: { marginTop: spacing.sm, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  pickerTitle: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textMuted },
  pickerItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.sm },
  pickerItemText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
  reset: { marginTop: spacing.lg, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  resetOff: { opacity: 0.4 },
  resetText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
