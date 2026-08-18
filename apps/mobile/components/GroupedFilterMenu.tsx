/**
 * Filter button + grouped checkbox menu — the RN counterpart of web's
 * apps/web/src/components/GroupedFilterMenu.jsx.
 *
 * Replaces the inline All/Movies/TV chips mobile used, which were a different
 * control with different semantics: the chips were single-select with an "All"
 * option, web's menu is multi-select where an empty selection means no filter.
 * Filtering itself goes through @plot/core's filterByType so both platforms
 * agree on the awkward part — `cinema` is a client-side flag, not a TMDB
 * media_type, so `movie` has to explicitly exclude it.
 *
 * The trigger picks up an active tint whenever a group differs from its
 * default, so a filter left on somewhere off-screen is still visible.
 */
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../lib/tokens';

export interface FilterOption { id: string; label: string }
export interface FilterGroup {
  heading: string;
  options: FilterOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Selection that counts as "unfiltered". Defaults to empty. */
  defaultValue?: string[];
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

  const toggleValue = (id: string, g: FilterGroup) =>
    g.onChange(g.value.includes(id) ? g.value.filter(v => v !== id) : [...g.value, id]);

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

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* Dismiss catcher — mirrors web's outside-click handler. */}
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={() => setOpen(false)}>
          <View style={styles.panel}>
            {visibleGroups.map(group => (
              <View key={group.heading} style={styles.group}>
                <Text style={styles.heading}>{group.heading}</Text>
                {group.options.map(opt => {
                  const checked = group.value.includes(opt.id);
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      style={styles.option}
                      onPress={() => toggleValue(opt.id, group)}
                      activeOpacity={0.7}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked }}
                      accessibilityLabel={opt.label}
                    >
                      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                        {checked && (
                          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <Polyline points="20,6 9,17 4,12" />
                          </Svg>
                        )}
                      </View>
                      <Text style={styles.optionText}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </TouchableOpacity>
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
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  panel: {
    minWidth: 220,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  group: { paddingVertical: spacing.xs },
  heading: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xs,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionText: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary },
});
