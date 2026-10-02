// One smart list: the rules as chips, the matches they find right now, and
// Rename, Edit rules, Delete. New discoveries can join the weekly roll-up.
// Finding matches is @plot/core/useSmartList.js.
import { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, Image, Switch,
  StyleSheet, ActivityIndicator, Alert, useWindowDimensions,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import PlotLoader from '@plot/ui/PlotLoader';
import { useSmartList } from '@plot/core/useSmartList.js';
import { useSmartListSeen } from '@plot/core/useSmartListSeen.js';
import { useGenreCatalog } from '@plot/core/useGenres.js';
import { isSmartListPremiumError } from '@plot/core/customListCreation.js';
import { pickerProviderIds } from '@plot/core/tonightPicker.js';
import { smartListInRollUp, smartListRollUpEligible } from '@plot/core/smartLists.js';
import { dateToLocalStr, shortDayMonth } from '@plot/core/date.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { DEFAULT_REGION } from '@plot/core/regions.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { COMMON } from '@plot/core/copy/common.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { EVENTS, track } from '../../lib/analytics';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useAppData } from '../../contexts/AppDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import UpgradeSheet from '../UpgradeSheet';
import KebabMenu, { KebabMenuItem } from '../KebabMenu';
import SmartListDialog from './SmartListDialog';
import SmartListRules from './SmartListRules';
import {
  asCatalog, asMatches, asRules, asSmartRow,
  type SmartMatch, type SmartRules,
} from '../../lib/smartListModel';

const NONE: never[] = [];

type SmartQuery = {
  items: unknown;
  loading: boolean;
  error: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  unchecked: number;
  loadMore: () => Promise<void>;
  retry: () => void;
};

const dayLabel = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return shortDayMonth(dateToLocalStr(date));
};

export default function SmartListView({ listId }: { listId: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const posterW = (width - spacing.xl * 2 - spacing.sm * 2) / 3;
  const { open } = useMediaPanel();
  const { userId, profile, watchlist, history, customLists } = useAppData();
  const catalogRaw = useGenreCatalog();
  const catalog = useMemo(() => asCatalog(catalogRaw), [catalogRaw]);
  const list = useMemo(
    () => (customLists.smartLists || []).flatMap((row: unknown) => {
      const smart = asSmartRow(row);
      return smart?.id === listId ? [smart] : [];
    })[0] ?? null,
    [customLists.smartLists, listId],
  );
  const premium = isPremiumProfile(profile);
  const savedRules = asRules(list?.rules);
  const [draftRules, setDraftRules] = useState<SmartRules | null>(null);
  const rules = draftRules ?? savedRules;
  const hasServices = pickerProviderIds(profile?.streaming_providers).length > 0;
  const [editing, setEditing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(list?.name ?? '');
  const [upgrade, setUpgrade] = useState(false);
  const [rollUpDraft, setRollUpDraft] = useState<boolean | null>(null);
  const [rollUpError, setRollUpError] = useState(false);

  const smart = useSmartList({
    rules,
    enabled: premium && !!rules,
    watchlistItems: watchlist?.items ?? NONE,
    historyEntries: history?.entries ?? NONE,
    ready: !watchlist?.loading && !history?.loading,
    streamingProviders: profile?.streaming_providers,
    region: profile?.region || DEFAULT_REGION,
    hideKids: !profile?.include_kids_content,
  }) as SmartQuery;
  const items = useMemo(() => asMatches(smart.items), [smart.items]);
  const seen = useSmartListSeen({
    listId,
    userId,
    items,
    ready: premium && !!list && !smart.loading && !smart.error,
  }) as { fresh: unknown; rest: unknown; since: string | null };
  const fresh = useMemo(() => asMatches(seen.fresh), [seen.fresh]);
  const rest = useMemo(() => asMatches(seen.rest), [seen.rest]);
  const since = typeof seen.since === 'string' ? seen.since : null;

  const goBack = () => { if (router.canGoBack()) router.back(); else router.replace('/(app)/my-lists' as Href); };
  const openUpgrade = () => {
    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'smart_lists' });
    setUpgrade(true);
  };

  if (customLists.loading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;
  if (!list || !rules) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <BackBar onPress={goBack} color={colors.textPrimary} />
        <Text style={styles.missing}>{SMART_LISTS.loadFailed}</Text>
      </View>
    );
  }

  const changeRules = async (next: SmartRules) => {
    if (!premium) { openUpgrade(); return; }
    setDraftRules(next);
    try {
      await customLists.updateSmartList(list.id, next);
    } catch (failure) {
      if (isSmartListPremiumError(failure)) openUpgrade();
    } finally {
      setDraftRules(null);
    }
  };

  const rollUpShown = premium && smartListRollUpEligible(rules) && (!list.user_id || list.user_id === userId);
  const inRollUp = rollUpDraft ?? smartListInRollUp(list);
  const toggleRollUp = async () => {
    if (rollUpDraft !== null) return;
    const next = !inRollUp;
    setRollUpDraft(next);
    setRollUpError(false);
    const ok = await customLists.setSmartListDigest(list.id, next);
    if (!ok) setRollUpError(true);
    setRollUpDraft(null);
  };

  const submitRename = async () => {
    const next = renameValue.trim();
    if (!next) return;
    const ok = await customLists.renameList(list.id, next);
    if (ok) setRenaming(false);
  };

  const menuItems: KebabMenuItem[] = [
    { label: 'Rename', onPress: () => { setRenameValue(list.name); setRenaming(true); } },
    { label: SMART_LISTS.editRules, onPress: () => (premium ? setEditing(true) : openUpgrade()) },
    { label: 'Delete list', danger: true, onPress: () => Alert.alert(
      `Delete "${list.name}"?`,
      "This can't be undone.",
      [
        { text: COMMON.cancel, style: 'cancel' },
        { text: 'Delete list', style: 'destructive', onPress: async () => {
          const deleted = await customLists.deleteList(list.id);
          if (deleted) goBack();
        } },
      ],
    ) },
  ];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <BackBar onPress={goBack} color={colors.textPrimary} />
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>{list.name}</Text>
          <Text style={styles.subtitle}>{since ? SMART_LISTS.lastOpened(dayLabel(since)) : SMART_LISTS.badge}</Text>
        </View>
        {premium && <Text style={styles.count}>{items.length}</Text>}
        <KebabMenu accessibilityLabel={`Open options for ${list.name}`} items={menuItems} />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        keyboardShouldPersistTaps="handled"
      >
        {renaming && (
          <View style={styles.renameRow}>
            <TextInput
              style={styles.renameInput}
              value={renameValue}
              onChangeText={setRenameValue}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitRename}
              accessibilityLabel={`Rename ${list.name}`}
            />
            <TouchableOpacity onPress={submitRename} accessibilityRole="button">
              <Text style={styles.link}>{COMMON.save}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRenaming(false)} accessibilityRole="button">
              <Text style={styles.muted}>{COMMON.cancel}</Text>
            </TouchableOpacity>
          </View>
        )}

        <SmartListRules
          rules={rules}
          catalog={catalog}
          hasServices={hasServices}
          variant="page"
          onChange={premium ? changeRules : undefined}
        />
        {premium && !smart.loading && !smart.error && (
          <Text style={styles.meta}>{SMART_LISTS.matchCount(items.length)} · {SMART_LISTS.tapHint}</Text>
        )}
        {rollUpShown && (
          <View style={styles.rollUp}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rollUpTitle}>{SMART_LISTS.rollUp}</Text>
              <Text style={[styles.rollUpHint, rollUpError && styles.rollUpError]} accessibilityRole={rollUpError ? 'alert' : undefined}>
                {rollUpError ? SMART_LISTS.rollUpFailed : inRollUp ? SMART_LISTS.rollUpOn : SMART_LISTS.rollUpOff}
              </Text>
            </View>
            <Switch
              value={inRollUp}
              disabled={rollUpDraft !== null}
              onValueChange={toggleRollUp}
              trackColor={{ true: colors.accent }}
              accessibilityLabel={SMART_LISTS.rollUp}
            />
          </View>
        )}

        <Matches
          premium={premium}
          smart={smart}
          items={items}
          fresh={fresh}
          rest={rest}
          since={since}
          posterW={posterW}
          styles={styles}
          colors={colors}
          onOpen={(item) => open(item.tmdb_id, item.media_type)}
          onUpgrade={openUpgrade}
        />
      </ScrollView>

      {editing && (
        <SmartListDialog
          list={list}
          lists={[]}
          premium={premium}
          onConfirm={async (_name, next) => {
            try {
              const saved = await customLists.updateSmartList(list.id, next);
              if (saved) setEditing(false);
              return saved;
            } catch (failure) {
              if (isSmartListPremiumError(failure)) { setEditing(false); openUpgrade(); return null; }
              throw failure;
            }
          }}
          onClose={() => setEditing(false)}
          onPremium={() => { setEditing(false); openUpgrade(); }}
        />
      )}
      <UpgradeSheet
        visible={upgrade}
        reason="smartLists"
        onClose={() => setUpgrade(false)}
        onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)}
      />
    </View>
  );
}

function BackBar({ onPress, color }: { onPress: () => void; color: string }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back" accessibilityRole="button">
      <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M15 18l-6-6 6-6" />
      </Svg>
    </TouchableOpacity>
  );
}

function Matches({
  premium, smart, items, fresh, rest, since, posterW, styles, colors, onOpen, onUpgrade,
}: {
  premium: boolean;
  smart: SmartQuery;
  items: SmartMatch[];
  fresh: SmartMatch[];
  rest: SmartMatch[];
  since: string | null;
  posterW: number;
  styles: ReturnType<typeof makeStyles>;
  colors: Palette;
  onOpen: (item: SmartMatch) => void;
  onUpgrade: () => void;
}) {
  if (!premium) {
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedTitle}>{SMART_LISTS.lockedTitle}</Text>
        <Text style={styles.lockedBody}>{SMART_LISTS.lockedBody}</Text>
        <TouchableOpacity style={styles.primary} onPress={onUpgrade} accessibilityRole="button">
          <Text style={styles.primaryText}>{SMART_LISTS.lockedAction}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (smart.loading) return <ActivityIndicator color={colors.textPrimary} style={{ marginTop: spacing.xl }} />;
  if (smart.error) {
    return (
      <View style={styles.locked}>
        <Text style={styles.lockedBody}>{SMART_LISTS.loadFailed}</Text>
        <TouchableOpacity onPress={smart.retry} accessibilityRole="button">
          <Text style={styles.link}>{SMART_LISTS.retry}</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (items.length === 0) return <Text style={styles.lockedBody}>{SMART_LISTS.empty}</Text>;

  const grid = (rows: SmartMatch[]) => (
    <View style={styles.grid}>
      {rows.map((item) => {
        const uri = posterUrl(item.poster_path, 'w185');
        return (
          <TouchableOpacity key={item.id} style={{ width: posterW }} onPress={() => onOpen(item)} accessibilityRole="button">
            <View style={[styles.poster, { width: posterW, height: posterW * 1.5 }]}>
              {uri ? <Image source={{ uri }} style={styles.posterImage} /> : null}
            </View>
            <Text style={styles.posterTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.posterMeta}>{item.media_type === 'tv' ? MEDIA.series : MEDIA.movie}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View>
      {fresh.length > 0 ? (
        <>
          <View style={styles.groupHead}>
            <Text style={styles.groupTitle}>{SMART_LISTS.newSince}</Text>
            <Text style={styles.groupNew}>
              {fresh.length}{since ? ` · ${SMART_LISTS.sinceDate(dayLabel(since))}` : ''}
            </Text>
          </View>
          {grid(fresh)}
          {rest.length > 0 && (
            <>
              <View style={styles.groupHead}>
                <Text style={styles.groupTitle}>{SMART_LISTS.everythingElse}</Text>
                <Text style={styles.groupCount}>{rest.length}</Text>
              </View>
              {grid(rest)}
            </>
          )}
        </>
      ) : grid(items)}
      {smart.hasMore && (
        <TouchableOpacity style={styles.more} disabled={smart.loadingMore} onPress={smart.loadMore} accessibilityRole="button">
          {smart.loadingMore
            ? <ActivityIndicator color={colors.textPrimary} />
            : <Text style={styles.moreText}>{SMART_LISTS.loadMore}</Text>}
        </TouchableOpacity>
      )}
      {smart.unchecked > 0 && <Text style={styles.note}>{SMART_LISTS.unchecked(smart.unchecked)}</Text>}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  titleBlock: { flex: 1 },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary, letterSpacing: -0.5 },
  subtitle: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  count: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  renameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  renameInput: {
    flex: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: colors.accent,
    paddingVertical: spacing.xs,
  },
  meta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.sm, marginBottom: spacing.md },
  rollUp: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  rollUpTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  rollUpHint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  rollUpError: { color: colors.danger },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  groupTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary, letterSpacing: -0.5 },
  groupCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  groupNew: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.accentText },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  poster: { borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  posterImage: { width: '100%', height: '100%' },
  posterTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary, marginTop: spacing.xs },
  posterMeta: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },
  more: {
    alignSelf: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  moreText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  note: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.md },
  locked: { gap: spacing.sm, paddingVertical: spacing.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, marginTop: spacing.md },
  lockedTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  lockedBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  missing: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, padding: spacing.xl },
  primary: { alignSelf: 'flex-start', backgroundColor: colors.accentFill, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.onAccentFill },
  link: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accentText },
  muted: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
});
