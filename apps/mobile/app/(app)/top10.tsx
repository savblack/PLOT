import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity, TextInput,
  Modal, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PlotLoader from '@plot/ui/PlotLoader';
import ErrorState from '../../components/ErrorState';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { ListType } from '../../hooks/useTopLists';
import { useAppData } from '../../contexts/AppDataContext';
import { tmdb } from '../../lib/tmdb';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

// ── Search / pick modal ───────────────────────────────────────────────
function SearchPickModal({
  title, mediaFilter, historyEntries, onSelect, onClose,
}: {
  title: string;
  mediaFilter?: 'movie' | 'tv';
  historyEntries: any[];
  onSelect: (item: any) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab,     setTab]     = useState<'history' | 'search'>('history');
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const filtered = historyEntries.filter(e =>
    (!mediaFilter || e.media_type === mediaFilter) &&
    (!query.trim() || (e.title || '').toLowerCase().includes(query.toLowerCase()))
  );

  useEffect(() => {
    if (tab !== 'search' || !query.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const data = await tmdb.search(query);
      setResults(
        (data?.results || [])
          .filter((r: any) => r.media_type === 'movie' || r.media_type === 'tv')
          .filter((r: any) => !mediaFilter || r.media_type === mediaFilter)
          .slice(0, 15)
      );
      setLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [query, tab, mediaFilter]);

  const rows = tab === 'history' ? filtered : results;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modalContainer, { paddingTop: insets.top }]}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md }}>Done</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.modalTabs}>
          {(['history', 'search'] as const).map(t => (
            <TouchableOpacity
              key={t}
              style={[styles.modalTab, tab === t && styles.modalTabActive]}
              onPress={() => { setTab(t); setQuery(''); }}
            >
              <Text style={[styles.modalTabText, tab === t && styles.modalTabTextActive]}>
                {t === 'history' ? 'From history' : 'Search all'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.modalSearch}>
          <TextInput
            style={styles.modalSearchInput}
            placeholder={tab === 'history' ? 'Filter…' : 'Search…'}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
          />
        </View>
        {loading && <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />}
        <ScrollView style={{ flex: 1 }}>
          {rows.map((item: any) => {
            const img = posterUrl(item.poster_path, 'w92');
            return (
              <TouchableOpacity
                key={item.id || item.tmdb_id}
                style={styles.modalRow}
                onPress={() => { onSelect(item); onClose(); }}
                activeOpacity={0.7}
              >
                <View style={styles.modalRowPoster}>
                  {img
                    ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                    : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
                  }
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalRowTitle}>{item.title || item.name}</Text>
                  <Text style={styles.modalRowMeta}>{(item.release_date || item.first_air_date || '').slice(0, 4)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {!loading && rows.length === 0 && (
            <Text style={styles.modalEmpty}>
              {tab === 'search' && !query.trim() ? 'Start typing to search' : 'No results'}
            </Text>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Rank row ──────────────────────────────────────────────────────────
function RankRow({ rank, item, editMode, onRemove, onMoveUp, onMoveDown, canMoveUp = true, canMoveDown = true }: {
  rank: number;
  item: any | null;
  editMode: boolean;
  onRemove?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rankColor = rank === 1 ? colors.accent : rank <= 3 ? colors.textSecondary : colors.textMuted;
  const img = item ? posterUrl(item.poster_path, 'w92') : null;

  return (
    <View style={styles.rankRow}>
      <Text style={[styles.rankNum, { color: rankColor }]}>{rank}</Text>
      {item ? (
        <>
          <View style={styles.rankPoster}>
            {img
              ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
            }
          </View>
          <Text style={styles.rankTitle} numberOfLines={1}>{item.title}</Text>
          {editMode && (
            <View style={styles.rankActions}>
              <TouchableOpacity
                onPress={onMoveUp}
                disabled={!canMoveUp}
                style={styles.rankActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Move up in ranking"
                accessibilityRole="button"
              >
                <Text style={{ color: canMoveUp ? colors.textPrimary : colors.textMuted, fontSize: 14, opacity: canMoveUp ? 1 : 0.3 }}>↑</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onMoveDown}
                disabled={!canMoveDown}
                style={styles.rankActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Move down in ranking"
                accessibilityRole="button"
              >
                <Text style={{ color: canMoveDown ? colors.textPrimary : colors.textMuted, fontSize: 14, opacity: canMoveDown ? 1 : 0.3 }}>↓</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onRemove}
                style={styles.rankActionBtn}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityLabel="Remove from Top 10"
                accessibilityRole="button"
              >
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>✕</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={styles.rankEmptyPoster}>
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>+</Text>
          </View>
          <Text style={styles.rankEmptyPrompt}>
            {rank === 1 ? "What's your GOAT?" : 'Add a title'}
          </Text>
        </>
      )}
    </View>
  );
}

// ── Top 10 section ────────────────────────────────────────────────────
function TopTenSection({ listType, title, topLists, history }: {
  listType: ListType;
  title: string;
  topLists: any;
  history: any[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [editMode,   setEditMode]   = useState(false);
  const [addingRank, setAddingRank] = useState<number | null>(null);

  const items = topLists.lists[listType] || [];
  const slots = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <View>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTypeLabel}>{title}</Text>
        {items.length > 0 && (
          <TouchableOpacity onPress={() => setEditMode(m => !m)}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>
              {editMode ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {slots.map(rank => {
        const item = items.find((i: any) => i.rank === rank);
        return (
          <TouchableOpacity
            key={rank}
            onPress={() => !item && setAddingRank(rank)}
            activeOpacity={item ? 1 : 0.7}
          >
            <RankRow
              rank={rank}
              item={item || null}
              editMode={editMode}
              canMoveUp={rank !== 1}
              canMoveDown={rank !== 10}
              onRemove={() => item && topLists.removeSlot(listType, item.tmdb_id)}
              onMoveUp={() => topLists.moveUp(listType, rank)}
              onMoveDown={() => topLists.moveDown(listType, rank)}
            />
          </TouchableOpacity>
        );
      })}

      {addingRank !== null && (
        <SearchPickModal
          title={`Select #${addingRank} ${listType === 'movies' ? 'Movie' : 'TV Show'}`}
          mediaFilter={listType === 'movies' ? 'movie' : 'tv'}
          historyEntries={history}
          onSelect={(item) => topLists.setSlot(listType, addingRank, item)}
          onClose={() => setAddingRank(null)}
        />
      )}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function Top10Screen() {
  const insets  = useSafeAreaInsets();
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { topLists, history } = useAppData();

  if (topLists.loading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;
  if (topLists.error) return <ErrorState onRetry={topLists.reload} />;

  const HEADER_H = insets.top + 56;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >
        <TopTenSection listType="movies" title="Movies"   topLists={topLists} history={history.entries} />
        <View style={styles.sectionDivider} />
        <TopTenSection listType="tv"     title="TV Shows" topLists={topLists} history={history.entries} />
      </ScrollView>

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar title="Top 10" />
      </BlurView>

    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  fixedHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
  },
  sectionTypeLabel: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
  },
  sectionDivider: {
    height: spacing.xl,
    backgroundColor: colors.bg,
  },

  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rankNum: {
    fontFamily: fontFamily.serif,
    fontSize: 22,
    width: 28,
    textAlign: 'center',
  },
  rankPoster: {
    width: 36, height: 54,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    flexShrink: 0,
  },
  rankEmptyPoster: {
    width: 36, height: 54,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankTitle: {
    flex: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  rankEmptyPrompt: {
    flex: 1,
    fontFamily: fontFamily.serifItalic,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  rankActions: { flexDirection: 'row', gap: 2 },
  rankActionBtn: { width: iconButtonSize.md, height: iconButtonSize.md, alignItems: 'center', justifyContent: 'center' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: colors.bg },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  modalTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  modalTab: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalTabActive: { backgroundColor: colors.accentDim, borderColor: colors.accent + '55' },
  modalTabText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textMuted },
  modalTabTextActive: { color: colors.accent },
  modalSearch: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  modalSearchInput: {
    backgroundColor: colors.surface,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  modalRowPoster: {
    width: 40, height: 60,
    borderRadius: radii.sm,
    overflow: 'hidden',
    backgroundColor: colors.surfaceSunken,
    flexShrink: 0,
  },
  modalRowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: 3 },
  modalRowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  modalEmpty: {
    padding: spacing.xl,
    textAlign: 'center',
    color: colors.textMuted,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
  },
});
