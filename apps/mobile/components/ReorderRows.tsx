/**
 * A list the viewer puts in their own order: one row per item with up and
 * down buttons, and optionally a show/hide switch or a remove button. The RN
 * counterpart of apps/web/src/components/ReorderRows.jsx (which also drags;
 * the buttons are the whole affordance here). Shared by Customize Home and
 * Customize My Lists; the rules and saving live with their callers.
 */
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Switch } from 'react-native';
import { IconChevronDown, IconChevronUp } from './icons';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

function Chevron({ up, color }: { up?: boolean; color: string }) {
  const Icon = up ? IconChevronUp : IconChevronDown;
  return <Icon size={18} color={color} strokeWidth={2.2} />;
}

const SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

export default function ReorderRows({ rows, onNudge, labels, onToggle, onRemove }: {
  rows: { id: string; label: string; hidden?: boolean }[];
  onNudge: (id: string, delta: -1 | 1) => void;
  labels: {
    moveUp: (name: string) => string; moveDown: (name: string) => string;
    hiddenTag?: string; show?: (name: string) => string; hide?: (name: string) => string; remove?: (name: string) => string;
  };
  /** Omit for a list with no show/hide. */
  onToggle?: (id: string, visible: boolean) => void;
  /** Omit for a list whose rows cannot be removed. */
  onRemove?: (id: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.list}>
      {rows.map((row, index) => {
        const first = index === 0;
        const last = index === rows.length - 1;
        return (
          <View key={row.id} style={styles.row}>
            <View style={styles.labelWrap}>
              <Text style={[styles.label, row.hidden && styles.labelHidden]} numberOfLines={1}>{row.label}</Text>
              {row.hidden && labels.hiddenTag ? <Text style={styles.tag}>{labels.hiddenTag}</Text> : null}
            </View>
            <TouchableOpacity style={[styles.nudge, first && styles.nudgeOff]} disabled={first} onPress={() => onNudge(row.id, -1)} accessibilityRole="button" accessibilityLabel={labels.moveUp(row.label)} hitSlop={SLOP}>
              <Chevron up color={colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity style={[styles.nudge, last && styles.nudgeOff]} disabled={last} onPress={() => onNudge(row.id, 1)} accessibilityRole="button" accessibilityLabel={labels.moveDown(row.label)} hitSlop={SLOP}>
              <Chevron color={colors.textSecondary} />
            </TouchableOpacity>
            {onToggle ? (
              <Switch value={!row.hidden} onValueChange={on => onToggle(row.id, on)} trackColor={{ true: colors.accent }} accessibilityLabel={(row.hidden ? labels.show : labels.hide)?.(row.label)} />
            ) : null}
            {onRemove ? (
              <TouchableOpacity style={styles.nudge} onPress={() => onRemove(row.id)} accessibilityRole="button" accessibilityLabel={labels.remove?.(row.label)} hitSlop={SLOP}>
                <Text style={styles.remove}>×</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 52, paddingVertical: spacing.sm, paddingLeft: spacing.md, paddingRight: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface },
  labelWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { flexShrink: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  labelHidden: { color: colors.textMuted },
  tag: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: colors.textMuted, borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 1 },
  nudge: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  nudgeOff: { opacity: 0.3 },
  remove: { fontSize: 22, lineHeight: 24, color: colors.textSecondary },
});
