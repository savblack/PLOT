// Create or edit a smart list. The rules read as one sentence of chips. A
// live count and a row of posters show what they find before anything is
// saved. The name follows the rules until the viewer types their own.
// Free viewers can build and count. Create keeps the rules and the caller
// opens the upgrade sheet.
import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, Modal, Switch, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { isCustomListLimitError, isSmartListPremiumError } from '@plot/core/customListCreation.js';
import { defaultSmartListRules } from '@plot/core/smartLists.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { useSmartListPreview } from '@plot/core/useSmartListPreview.js';
import { useGenreCatalog } from '@plot/core/useGenres.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { COMMON } from '@plot/core/copy/common.js';
import { useAppData } from '../../contexts/AppDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import SmartListRules from './SmartListRules';
import {
  asCatalog, asMatches, asRules, suggestedName,
  type SmartListRow, type SmartRules,
} from '../../lib/smartListModel';

const NONE: never[] = [];

export default function SmartListDialog({
  list = null, initial = null, lists, premium, onConfirm, onClose, onPremium, onLocked, onLimit,
}: {
  list?: SmartListRow | null;
  initial?: { name: string; rules: SmartRules } | null;
  lists: { id: string; name: string }[];
  premium: boolean;
  onConfirm: (name: string, rules: SmartRules) => Promise<unknown>;
  onClose: () => void;
  onPremium: () => void;
  onLocked?: (name: string, rules: SmartRules) => void;
  onLimit?: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const insets = useSafeAreaInsets();
  const { profile, watchlist, history } = useAppData();
  const catalogRaw = useGenreCatalog();
  const catalog = useMemo(() => asCatalog(catalogRaw), [catalogRaw]);
  const editing = !!list;
  const [rules, setRules] = useState<SmartRules>(() => (
    asRules(list?.rules) ?? asRules(initial?.rules) ?? asRules(defaultSmartListRules()) ?? {
      v: 1, source: 'discover', mediaType: 'movie', genreIds: [], era: 'any',
      minScore: null, maxRuntime: null, onlyServices: false, minMyRating: null, hideWatched: true,
    }
  ));
  const [name, setName] = useState(initial?.name ?? '');
  const [nameTouched, setNameTouched] = useState(!!initial?.name);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const hasServices = pickerProviderIds(profile?.streaming_providers).length > 0;
  const suggested = useMemo(() => suggestedName(rules, catalog), [rules, catalog]);
  const shownName = nameTouched ? name : suggested;

  const live = useSmartListPreview({
    rules,
    enabled: true,
    watchlistItems: watchlist?.items ?? NONE,
    historyEntries: history?.entries ?? NONE,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
    hideKids: !profile?.include_kids_content,
  }) as { count: number | null; items: unknown; loading: boolean; fromTmdb: boolean };
  const posters = asMatches(live.items).slice(0, 4);
  const count = typeof live.count === 'number' ? live.count : null;

  const commitRules = (next: SmartRules) => { setRules(next); if (error) setError(''); };

  const submit = async () => {
    const finalName = shownName.trim();
    if ((!editing && !finalName) || submitting || !rules) return;
    const saving = asRules(hasServices ? rules : { ...rules, onlyServices: false }) ?? rules;
    if (!premium && !editing) { onLocked?.(finalName, saving); return; }
    const duplicate = !editing ? findDuplicateCustomList(lists, finalName) as { name?: string } | null : null;
    if (duplicate?.name) { setError(`"${duplicate.name}" already exists.`); return; }
    setSubmitting(true);
    setError('');
    try {
      const saved = await onConfirm(editing ? list.name : finalName, saving);
      if (!saved) setError(SMART_LISTS.couldNotSave);
    } catch (failure) {
      if (isSmartListPremiumError(failure)) { onPremium(); return; }
      if (onLimit && isCustomListLimitError(failure)) { onLimit(); return; }
      setError(SMART_LISTS.couldNotSave);
    } finally {
      setSubmitting(false);
    }
  };

  const title = editing ? SMART_LISTS.editRules : SMART_LISTS.newSmartList;
  const action = editing ? COMMON.save : SMART_LISTS.create;
  const busyLabel = editing ? COMMON.saving : SMART_LISTS.creating;
  const canSubmit = (editing || !!shownName.trim()) && !submitting;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <TouchableOpacity onPress={onClose} disabled={submitting} accessibilityRole="button">
            <Text style={styles.cancel}>{COMMON.cancel}</Text>
          </TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {!editing && <Text style={styles.intro}>{SMART_LISTS.intro}</Text>}
          {!editing && (
            <View style={styles.field}>
              <Text style={styles.label}>{SMART_LISTS.nameLabel}</Text>
              <TextInput
                style={styles.input}
                placeholder={SMART_LISTS.namePlaceholder}
                placeholderTextColor={colors.textMuted}
                value={shownName}
                editable={!submitting}
                maxLength={80}
                onChangeText={(value) => { setName(value); setNameTouched(true); if (error) setError(''); }}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
            </View>
          )}
          <View style={styles.field}>
            <Text style={styles.label}>{SMART_LISTS.rulesLabel}</Text>
            <SmartListRules rules={rules} catalog={catalog} hasServices={hasServices} onChange={commitRules} />
            {rules.source !== 'history' && (
              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>{SMART_LISTS.hideWatched}</Text>
                <Switch
                  value={rules.hideWatched}
                  onValueChange={() => commitRules(asRules({ ...rules, hideWatched: !rules.hideWatched }) ?? rules)}
                  trackColor={{ true: colors.accent }}
                  accessibilityLabel={SMART_LISTS.hideWatched}
                />
              </View>
            )}
          </View>
          <View style={styles.preview} accessibilityLiveRegion="polite">
            <Text style={styles.count}>
              {count == null ? (live.loading ? SMART_LISTS.counting : SMART_LISTS.countFailed) : SMART_LISTS.liveCount(count)}
            </Text>
            {count != null && live.fromTmdb && <Text style={styles.countSource}>{SMART_LISTS.liveCountSource}</Text>}
            {posters.length > 0 && (
              <View style={[styles.posters, live.loading && styles.postersStale]}>
                {posters.map((item) => {
                  const uri = posterUrl(displayPosterPath(art.apply(item)), 'w185');
                  return (
                    <View key={item.id} style={styles.poster}>
                      {uri ? <Image source={{ uri }} style={styles.posterImage} /> : null}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <TouchableOpacity
            style={[styles.primary, !canSubmit && styles.primaryOff]}
            disabled={!canSubmit}
            onPress={submit}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryText, !canSubmit && styles.primaryTextOff]}>
              {submitting ? busyLabel : action}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  title: { flex: 1, fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, letterSpacing: -0.6 },
  cancel: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textSecondary },
  body: { padding: spacing.xl, gap: spacing.lg },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  field: { gap: spacing.sm },
  label: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textMuted },
  input: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.sm },
  switchLabel: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  preview: { gap: spacing.xs },
  count: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, letterSpacing: -0.6 },
  countSource: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  posters: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  postersStale: { opacity: 0.45 },
  poster: { width: 56, height: 84, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  posterImage: { width: '100%', height: '100%' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.lg, gap: spacing.sm },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  primary: { backgroundColor: colors.accentFill, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  primaryOff: { backgroundColor: colors.surfaceSunken },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.onAccentFill },
  primaryTextOff: { color: colors.textMuted },
});
