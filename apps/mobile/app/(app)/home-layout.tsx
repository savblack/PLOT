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
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackBar from '../../components/BackBar';
import ReorderRows from '../../components/ReorderRows';
import QuietButton from '../../components/QuietButton';
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
  const pinByKey = (key: string) => layout.pins.find((p: { kind: string; id: string }) => `${p.kind}:${p.id}` === key);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <BackBar title={C.title} />

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
          <ReorderRows
            rows={layout.pins.map((p: { kind: string; id: string }) => ({ id: `${p.kind}:${p.id}`, label: pinLabel(p, { lists, follows: people.follows }) ?? C.pinGone }))}
            onNudge={(key, delta) => { const p = pinByKey(key); if (p) nudgePin(p, delta); }}
            onRemove={(key) => { const p = pinByKey(key); if (p) unpin(p); }}
            labels={{ moveUp: C.pinMoveUp, moveDown: C.pinMoveDown, remove: C.unpin }}
          />
        ) : null}
        {premium && !picking ? (
          <QuietButton label={full ? C.pinLimit(MAX_HOME_PINS) : C.pinAction} onPress={() => setPicking(true)} disabled={full} />
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
            <QuietButton label={C.pinCancel} onPress={() => setPicking(false)} />
          </View>
        ) : null}
        {!premium ? (
          <QuietButton label={C.pinsUpgrade} onPress={() => setUpgrade(true)} />
        ) : null}

        <Text style={styles.heading} accessibilityRole="header">{C.shelvesTitle}</Text>
        <ReorderRows
          rows={layout.order.map((id: string) => ({ id, label: HOME_SHELF_LABELS[id] ?? id, hidden: layout.hidden.includes(id) }))}
          onNudge={nudge}
          onToggle={setVisible}
          labels={{ moveUp: C.moveUp, moveDown: C.moveDown, hiddenTag: C.hiddenTag, show: C.show, hide: C.hide }}
        />
        <QuietButton label={C.reset} onPress={reset} disabled={isDefault} />
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
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, marginTop: spacing.md, marginBottom: spacing.lg },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, marginBottom: spacing.md },
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
  picker: { marginTop: spacing.sm, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  pickerTitle: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.textMuted },
  pickerItem: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm, borderRadius: radii.sm },
  pickerItemText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
});
