// A smart list's rules as one sentence of chips. Tapping a chip opens its
// choices under the sentence. What the sentence says lives in
// @plot/core/smartLists.js.
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { isRemovableSmartListRule } from '@plot/core/smartLists.js';
import { COMMON } from '@plot/core/copy/common.js';
import { useTheme } from '../../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import {
  applyRule, asAddable, asMenu, asSentence, dropRule,
  type GenreCatalog, type SmartRuleKey, type SmartRules,
} from '../../lib/smartListModel';

type OpenMenu =
  | { mode: 'add' }
  | { mode: 'rule'; rule: SmartRuleKey; adding: boolean }
  | null;

export default function SmartListRules({
  rules, catalog, hasServices, onChange, variant = 'card',
}: {
  rules: SmartRules;
  catalog: GenreCatalog;
  hasServices: boolean;
  onChange?: (next: SmartRules) => void;
  variant?: 'card' | 'page';
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors, variant), [colors, variant]);
  const [open, setOpen] = useState<OpenMenu>(null);
  const parts = asSentence(rules, catalog, hasServices);
  const addable = onChange ? asAddable(rules, hasServices) : [];
  const menu = open?.mode === 'rule' ? asMenu(open.rule, rules, catalog) : null;

  const change = (next: SmartRules) => onChange?.(next);

  const pick = (rule: SmartRuleKey, value: string | number | boolean | null, multi: boolean) => {
    change(applyRule(rules, rule, value, catalog));
    if (!multi) setOpen(null);
  };

  return (
    <View>
      <View style={styles.sentence}>
        {parts.map((part, index) => {
          if (part.kind === 'text') {
            return <Text key={`t-${index}`} style={styles.words}>{part.text}</Text>;
          }
          const expanded = open?.mode === 'rule' && open.rule === part.rule;
          if (!onChange) {
            return <Text key={`${part.rule}-${index}`} style={styles.chipTextStatic}>{part.text}</Text>;
          }
          const label = asMenu(part.rule, rules, catalog).label;
          return (
            <TouchableOpacity
              key={`${part.rule}-${index}`}
              style={[styles.chip, expanded && styles.chipOpen]}
              onPress={() => setOpen(expanded ? null : { mode: 'rule', rule: part.rule, adding: false })}
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              accessibilityLabel={`${part.text.replace(/[.,]$/, '')}. ${SMART_LISTS.ruleMenu(label)}`}
            >
              <Text style={styles.chipText}>{part.text}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {onChange && addable.length > 0 && (
        <TouchableOpacity
          style={styles.add}
          onPress={() => setOpen(open?.mode === 'add' ? null : { mode: 'add' })}
          accessibilityRole="button"
          accessibilityState={{ expanded: open?.mode === 'add' || (open?.mode === 'rule' && open.adding) }}
        >
          <Text style={styles.addText}>+ {SMART_LISTS.addRule}</Text>
        </TouchableOpacity>
      )}

      {open?.mode === 'add' && (
        <View style={styles.panel}>
          {addable.map((item) => (
            <TouchableOpacity
              key={item.rule}
              style={styles.choice}
              onPress={() => {
                if (item.rule === 'onlyServices') {
                  change(applyRule(rules, item.rule, true, catalog));
                  setOpen(null);
                  return;
                }
                setOpen({ mode: 'rule', rule: item.rule, adding: true });
              }}
              accessibilityRole="button"
            >
              <Text style={styles.choiceText}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {open?.mode === 'rule' && menu && (
        <View style={styles.panel}>
          {!!menu.label && <Text style={styles.panelTitle}>{menu.label}</Text>}
          {open.rule === 'genreIds' && <Text style={styles.hint}>{SMART_LISTS.genresHint}</Text>}
          <ScrollView style={styles.choices} nestedScrollEnabled>
            {menu.choices.map((choice) => (
              <TouchableOpacity
                key={String(choice.value)}
                style={styles.choice}
                onPress={() => pick(open.rule, choice.value, menu.multi)}
                accessibilityRole={menu.multi ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: choice.selected }}
              >
                <Text style={styles.choiceText}>{choice.label}</Text>
                {choice.selected && <Text style={styles.check}>✓</Text>}
              </TouchableOpacity>
            ))}
          </ScrollView>
          {menu.multi && (
            <TouchableOpacity style={styles.done} onPress={() => setOpen(null)} accessibilityRole="button">
              <Text style={styles.doneText}>{COMMON.done}</Text>
            </TouchableOpacity>
          )}
          {isRemovableSmartListRule(open.rule) && !open.adding && (
            <TouchableOpacity
              style={styles.remove}
              onPress={() => { change(dropRule(rules, open.rule)); setOpen(null); }}
              accessibilityRole="button"
            >
              <Text style={styles.removeText}>{SMART_LISTS.removeRule}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette, variant: 'card' | 'page') => StyleSheet.create({
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  words: {
    fontFamily: fontFamily.sans,
    fontSize: variant === 'page' ? fontSize.md : fontSize.lg,
    color: colors.textSecondary,
    lineHeight: variant === 'page' ? 28 : 32,
  },
  chip: {
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  chipOpen: { borderColor: colors.accent },
  chipText: {
    fontFamily: fontFamily.sansBold,
    fontSize: variant === 'page' ? fontSize.md : fontSize.lg,
    color: colors.textPrimary,
  },
  chipTextStatic: {
    fontFamily: fontFamily.sansBold,
    fontSize: variant === 'page' ? fontSize.md : fontSize.lg,
    color: colors.textPrimary,
    backgroundColor: colors.surfaceSunken,
    borderRadius: radii.pill,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  add: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
  },
  addText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  panel: {
    marginTop: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  panelTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  hint: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  choices: { maxHeight: 260 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  choiceText: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  check: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accent },
  done: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  doneText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  remove: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  removeText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
