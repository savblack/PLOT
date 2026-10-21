/**
 * Filter button + bottom Filters sheet, the RN counterpart of web's phone
 * MobilePageControls (apps/web/src/components/MobilePageControls.jsx): a grab
 * handle, a Filters heading, one section per group with a tick on each chosen
 * row, and Reset / Done at the foot. Groups are multi-select by default, where
 * an empty selection means no filter; `mode: 'single'` makes one pick stand
 * (My Lists' Show). Filtering itself goes through @plot/core's filterByType so
 * both platforms agree on the awkward part: `cinema` is a client-side flag,
 * not a TMDB media_type, so `movie` has to explicitly exclude it.
 *
 * The trigger picks up an active tint whenever a group differs from its
 * default, so a filter left on somewhere off-screen is still visible.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Pressable, ScrollView, StyleSheet, Modal, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COMMON } from '@plot/core/copy/common.js';
import { MOBILE_CONTROLS } from '@plot/core/copy/mobileControls.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, iconButtonSize } from '../lib/tokens';

export interface FilterOption { id: string; label: string }
export interface FilterGroup {
  heading: string;
  options: FilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Selection that counts as "unfiltered". Defaults to empty. */
  defaultValue?: string[];
  /** `single` keeps exactly one option chosen (a view switch). Default `multi`. */
  mode?: 'single' | 'multi';
}

function FilterIcon({ color }: { color: string }) {
  // Same three-rule glyph as web's FilterIcon (M4 6h16M7 12h10M10 18h4).
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Path d="M4 6h16" />
      <Path d="M7 12h10" />
      <Path d="M10 18h4" />
    </Svg>
  );
}

export default function GroupedFilterMenu({
  groups, accessibilityLabel = 'Filter',
}: {
  groups: FilterGroup[];
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const visibleGroups = groups.filter(g => g.options.length > 0);
  if (!visibleGroups.length) return null;

  // Order-independent comparison against the group's default, matching web.
  const isGroupActive = (g: FilterGroup) => {
    const def = g.defaultValue ?? [];
    if (g.value.length !== def.length) return true;
    const defSet = new Set(def);
    return !g.value.every(v => defSet.has(v));
  };
  const hasActiveFilters = visibleGroups.some(isGroupActive);

  const choose = (id: string, g: FilterGroup) => {
    if (g.mode === 'single') return g.onChange([id]);
    g.onChange(g.value.includes(id) ? g.value.filter(v => v !== id) : [...g.value, id]);
  };
  const reset = () => visibleGroups.forEach(g => g.onChange(g.defaultValue ?? []));
  const close = () => setOpen(false);

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, hasActiveFilters && styles.triggerActive]}
        onPress={() => setOpen(true)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <FilterIcon color={hasActiveFilters ? colors.accent : colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <View style={styles.overlay}>
          {/* Tapping the dimmed page dismisses, as on web. */}
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel={COMMON.close} />
          <View style={[styles.sheet, { maxHeight: height * 0.75, paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.handle} />
            <View style={styles.headingRow}>
              <Text style={styles.heading} accessibilityRole="header">{MOBILE_CONTROLS.filters}</Text>
              <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={COMMON.close}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round">
                  <Path d="M6 6l12 12M18 6L6 18" />
                </Svg>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} bounces={false}>
              {visibleGroups.map(group => (
                <View key={group.heading} style={styles.group}>
                  <Text style={styles.groupHeading}>{group.heading}</Text>
                  {group.options.map((opt, index) => {
                    const chosen = group.value.includes(opt.id);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[styles.row, index > 0 && styles.rowDivider]}
                        onPress={() => choose(opt.id, group)}
                        activeOpacity={0.7}
                        accessibilityRole={group.mode === 'single' ? 'radio' : 'checkbox'}
                        accessibilityState={group.mode === 'single' ? { selected: chosen } : { checked: chosen }}
                        accessibilityLabel={opt.label}
                      >
                        <Text style={[styles.rowText, chosen && styles.rowTextChosen]}>{opt.label}</Text>
                        <View style={styles.tick}>
                          {chosen && (
                            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                              <Path d="M20 6L9 17l-5-5" />
                            </Svg>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
            <View style={styles.footer}>
              <TouchableOpacity onPress={reset} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button">
                <Text style={styles.reset}>{MOBILE_CONTROLS.reset}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.done} onPress={close} accessibilityRole="button">
                <Text style={styles.doneText}>{COMMON.done}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  trigger: {
    width: iconButtonSize.md,
    height: iconButtonSize.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  triggerActive: {},
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.xl,
  },
  handle: { alignSelf: 'center', width: 32, height: 3, borderRadius: 3, backgroundColor: colors.borderStrong, marginTop: 10, marginBottom: 5 },
  headingRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  heading: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary },
  scroll: { flexGrow: 0 },
  group: { paddingTop: spacing.lg },
  groupHeading: {
    fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.6,
    textTransform: 'uppercase', color: colors.textMuted, paddingBottom: spacing.xs,
  },
  row: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textSecondary },
  rowTextChosen: { fontFamily: fontFamily.sansMedium, color: colors.textPrimary },
  tick: { width: 22, alignItems: 'center' },
  footer: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: spacing.lg, marginTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  reset: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  done: { minHeight: 44, paddingHorizontal: spacing.xl, borderRadius: 22, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: '#fff' },
});
