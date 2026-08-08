import { useState, useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity, TextInput,
  Modal, StyleSheet, Dimensions, ActivityIndicator, Alert, Share, LayoutAnimation,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Line } from 'react-native-svg';
import PlotLoader from '@plot/ui/PlotLoader';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useAppData } from '../../contexts/AppDataContext';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { tmdb } from '../../lib/tmdb';
import { favoriteWords } from '../../lib/spelling';
import CollapsibleSection from '../../components/CollapsibleSection';
import SectionToggleIcon from '../../components/SectionToggleIcon';
import SelectCircle from '../../components/SelectCircle';
import KebabMenu, { KebabMenuItem } from '../../components/KebabMenu';
import { getSectionOpen, setSectionOpen } from '../../lib/sectionOpenState';
import { MEDIA } from '@plot/core/copy/media.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii, iconButtonSize } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { COMMON } from '@plot/core/copy/common.js';

const SCREEN_W = Dimensions.get('window').width;
const POSTER_W = (SCREEN_W - spacing.xl * 2 - spacing.sm * 2) / 3;
const POSTER_H = POSTER_W * 1.5; // 2:3 — explicit height (aspectRatio collapses in a flex-wrap row on Fabric)

// Public custom-list share URL — mirrors web buildListShareUrl (/list/:id).
const SHARE_BASE = 'https://app.theplot.tv';
const buildListShareUrl = (listId: string) => `${SHARE_BASE}/list/${listId}`;

// Filter list items by media type. Items are treated as movies when untyped.
// Mirrors web's ALL_LIST_SECTION_IDS (MyListsView.jsx). Tab ids match section
// ids 1:1, which is what lets the expand/collapse-all control scope itself to
// whichever tab is active.
const LIST_SECTION_IDS = ['watching', 'want', 'favorites', 'lists'];

type TypeFilter = 'all' | 'movie' | 'tv';
const applyTypeFilter = (items: any[], filter: TypeFilter) =>
  filter === 'all' ? items : items.filter(i => (i.media_type || 'movie') === filter);

const TABS = [
  { id: 'all',       label: 'All'           },
  { id: 'watching',  label: 'Watching'      },
  { id: 'want',      label: 'Want to Watch' },
  { id: 'favorites', label: 'Favourites'    },
  { id: 'lists',     label: 'Lists'         },
];

// Release / streaming countdown chip — ports web countdownChip(); maps onto
// the shared status-colour tokens (today / tomorrow / soon / muted).
function countdownChip(dateStr: string | null | undefined, colors: Palette): { label: string; color: string } | null {
  if (!dateStr) return null;
  const [y, m, day] = dateStr.split('-').map(Number);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(y, m - 1, day);
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (diff < 0)   return null; // already out — no chip (only upcoming dates are useful)
  if (diff === 0) return { label: 'Today',        color: colors.chipToday };
  if (diff === 1) return { label: 'Tomorrow',     color: colors.chipTomorrow };
  if (diff <= 7)  return { label: `${diff} days`, color: colors.chipSoon };
  return { label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), color: colors.textMuted };
}

// ── Sub-tab (underline style) ─────────────────────────────────────────
function SubTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.subTab}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.subTabText, active && styles.subTabTextActive]}>{label}</Text>
      <View style={[styles.subTabUnderline, active && styles.subTabUnderlineActive]} />
    </TouchableOpacity>
  );
}

// ── Section add button ────────────────────────────────────────────────
// The "+" that used to live inside SectionBar. Now passed to
// CollapsibleSection's headerRight slot, matching web's headerRight pattern.
function SectionAddButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity
      style={styles.sectionAddBtn}
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={label}
      accessibilityRole="button"
    >
      <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <Line x1={12} y1={5} x2={12} y2={19} />
        <Line x1={5} y1={12} x2={19} y2={12} />
      </Svg>
    </TouchableOpacity>
  );
}

// ── Multi-select ──────────────────────────────────────────────────────
// Edit state for one selectable section. Web keeps this inside each of its
// section components (FavoritesSection, WatchingSection, WantToWatchSection,
// CustomListsSection); mobile renders those sections inline in one screen, so
// it lives in a hook rather than four near-identical copies.
function useSelection() {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const toggle = (tmdbId: number) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(tmdbId)) next.delete(tmdbId); else next.add(tmdbId);
    return next;
  });
  const exit = () => { setEditMode(false); setSelected(new Set()); };

  return { editMode, selected, toggle, exit, enter: () => setEditMode(true) };
}
type Selection = ReturnType<typeof useSelection>;

function TrashIcon({ color }: { color: string }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3,6 5,6 21,6" />
      <Path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

// Header-right cluster for a selectable section: a trash once something is
// picked, Done to leave edit mode, otherwise a kebab offering "Select".
// Mirrors the headerRight web builds in each section of MyListsView.jsx.
function SectionSelectActions({
  sel, count, deleteLabel, menuLabel, onDelete,
}: {
  sel: Selection;
  count: number;
  deleteLabel: string;
  menuLabel: string;
  onDelete: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };

  if (sel.editMode) {
    return (
      <>
        {sel.selected.size > 0 && (
          <TouchableOpacity
            onPress={onDelete}
            hitSlop={hitSlop}
            accessibilityLabel={`${deleteLabel} (${sel.selected.size})`}
            accessibilityRole="button"
          >
            <TrashIcon color={colors.danger} />
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={sel.exit} hitSlop={hitSlop} accessibilityLabel={COMMON.done} accessibilityRole="button">
          <Text style={styles.sectionActionText}>{COMMON.done}</Text>
        </TouchableOpacity>
      </>
    );
  }
  // Nothing to select yet — web hides the kebab on an empty section too.
  if (count === 0) return null;
  return <KebabMenu accessibilityLabel={menuLabel} items={[{ label: COMMON.select, onPress: sel.enter }]} />;
}

// ── List row ──────────────────────────────────────────────────────────
function ListRow({ item, trailing, onPress, sel }: {
  item: any;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Present when the row's section supports multi-select. */
  sel?: Selection;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const img    = posterUrl(item.poster_path, 'w92');
  const title  = item.title || item.name || '';
  const isTV   = item.media_type === 'tv';
  const epCode = item.current_season != null
    ? `S${String(item.current_season).padStart(2,'0')}E${String(item.current_episode).padStart(2,'0')}`
    : null;

  const editing    = !!sel?.editMode;
  const isSelected = !!sel?.selected.has(item.tmdb_id);
  // In edit mode the whole row toggles selection instead of opening the panel,
  // so a mis-tap picks a title rather than navigating away. Same as web.
  const handlePress = editing ? () => sel!.toggle(item.tmdb_id) : onPress;

  return (
    <TouchableOpacity
      style={styles.listRow}
      onPress={handlePress}
      activeOpacity={handlePress ? 0.7 : 1}
      accessibilityLabel={editing ? `${isSelected ? COMMON.deselect : COMMON.select} ${title}` : undefined}
    >
      <View style={styles.listRowPoster}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
        {editing && (
          <SelectCircle
            variant="row"
            selected={isSelected}
            onPress={() => sel!.toggle(item.tmdb_id)}
            label={`${isSelected ? COMMON.deselect : COMMON.select} ${title}`}
          />
        )}
      </View>
      <View style={styles.listRowInfo}>
        <Text style={styles.listRowTitle} numberOfLines={2}>{title}</Text>
      </View>
      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{isTV ? 'Series' : 'Movie'}</Text>
      </View>
      {epCode && (
        <View style={styles.epChip}>
          <Text style={styles.epChipText}>{epCode}</Text>
        </View>
      )}
      {trailing}
    </TouchableOpacity>
  );
}

// ── Poster grid ───────────────────────────────────────────────────────
function PosterGrid({ items, onRemove, horizontal, removeLabel = COMMON.remove, onPress, sel }: {
  items: any[];
  onRemove?: (tmdbId: number) => void;
  horizontal?: boolean;
  removeLabel?: string;
  onPress?: (item: any) => void;
  /** Present when the grid's section supports multi-select. */
  sel?: Selection;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const editing = !!sel?.editMode;

  const renderCard = (item: any) => {
    const img   = posterUrl(item.poster_path, 'w185');
    const title = item.title || item.name || '';
    const isSelected = !!sel?.selected.has(item.tmdb_id);
    const handlePress = editing
      ? () => sel!.toggle(item.tmdb_id)
      : (onPress ? () => onPress(item) : undefined);

    return (
      <View key={item.id || item.tmdb_id} style={{ width: POSTER_W }}>
        <TouchableOpacity
          style={styles.posterCard}
          onPress={handlePress}
          disabled={!handlePress}
          activeOpacity={0.7}
          accessibilityRole={handlePress ? 'button' : undefined}
          accessibilityLabel={
            editing ? `${isSelected ? COMMON.deselect : COMMON.select} ${title}`
            : handlePress ? `View details for ${title}`
            : undefined
          }
        >
          {img
            ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
          }
          {/* The per-card ✕ and the selection circle claim the same corner —
              edit mode owns it while active, so only one is ever drawn. */}
          {onRemove && !editing && (
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(item.tmdb_id)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              accessibilityLabel={removeLabel}
              accessibilityRole="button"
            >
              <Text style={{ color: '#fff', fontSize: 10, lineHeight: 14 }}>✕</Text>
            </TouchableOpacity>
          )}
          {editing && (
            <SelectCircle
              variant="grid"
              selected={isSelected}
              onPress={() => sel!.toggle(item.tmdb_id)}
              label={`${isSelected ? COMMON.deselect : COMMON.select} ${title}`}
            />
          )}
        </TouchableOpacity>
        <Text style={styles.posterTitle} numberOfLines={1}>{title}</Text>
      </View>
    );
  };

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.posterRow}
      >
        {items.map(renderCard)}
      </ScrollView>
    );
  }
  return <View style={styles.posterGrid}>{items.map(renderCard)}</View>;
}

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
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tab,      setTab]      = useState<'history' | 'search'>('history');
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<any[]>([]);
  const [loading,  setLoading]  = useState(false);

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
      <View style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={{ color: colors.accent, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md }}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Tabs */}
        <View style={styles.modalTabs}>
          <SubTab label="From history" active={tab === 'history'} onPress={() => { setTab('history'); setQuery(''); }} />
          <SubTab label="Search all"   active={tab === 'search'}  onPress={() => setTab('search')} />
        </View>

        {/* Search input */}
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
                  <Text style={styles.modalRowMeta}>
                    {(item.release_date || item.first_air_date || '').slice(0, 4)}
                  </Text>
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

// ── Create list modal ─────────────────────────────────────────────────
function CreateListModal({ onConfirm, onClose }: { onConfirm: (name: string) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState('');
  return (
    <Modal visible animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={styles.createModal}>
        <Text style={styles.createModalTitle}>New list</Text>
        <TextInput
          style={styles.createModalInput}
          placeholder="List name…"
          placeholderTextColor={colors.textMuted}
          value={name}
          onChangeText={setName}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={() => name.trim() && onConfirm(name.trim())}
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            style={[styles.createModalBtn, { flex: 1, backgroundColor: name.trim() ? colors.accent : colors.surfaceSunken }]}
            onPress={() => name.trim() && onConfirm(name.trim())}
          >
            <Text style={{ color: name.trim() ? '#fff' : colors.textMuted, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>Create</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.createModalBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]} onPress={onClose}>
            <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────
export default function MyListsScreen() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { open: openPanel } = useMediaPanel();
  const { watchlist, watching, favorites, customLists, history, profile } = useAppData();
  const fw = favoriteWords(profile?.region);

  const [tab,          setTab]          = useState('all');
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all');
  // Section ids match web's ALL_LIST_SECTION_IDS so a section means the same
  // thing on both platforms and shares the `plot.section.<id>` storage key.
  // Seeded synchronously from the cache hydrated at app start.
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(LIST_SECTION_IDS.map(id => [id, getSectionOpen(id, true)])));
  const setSectionOpenFor = (id: string, open: boolean) =>
    setSectionsOpen(prev => ({ ...prev, [id]: open }));

  // One edit state per selectable section. Independent, as on web: putting
  // Watching into select mode leaves Favourites alone.
  const watchingSel = useSelection();
  const wantSel     = useSelection();
  const favSel      = useSelection();

  const [showAddFav,     setShowAddFav]     = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);

  // Free accounts get FREE_CUSTOM_LIST_CAP lists; Premium unlimited. The DB
  // (RLS insert policy) is the authority — this is just friendlier UX.
  const requestCreateList = () => {
    if (!canCreateCustomList(customLists.lists.length, profile)) {
      Alert.alert('List limit', `You've got ${FREE_CUSTOM_LIST_CAP} lists. PLOT Premium gets unlimited.`);
      return;
    }
    setShowCreateList(true);
  };
  const [showAddToList,  setShowAddToList]  = useState<string | null>(null);

  const isLoading = watchlist.loading || watching.loading || favorites.loading || customLists.loading;
  if (isLoading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;

  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();

  const watchingIds = new Set(watching.items.map((i: any) => i.tmdb_id));
  const savedItems  = watchlist.items.filter((i: any) => !watchingIds.has(Number(i.tmdb_id)));
  const comingSoon  = savedItems.filter((i: any) => i.release_date && i.release_date > todayStr)
    .sort((a: any, b: any) => a.release_date.localeCompare(b.release_date));
  const available   = savedItems.filter((i: any) => !i.release_date || i.release_date <= todayStr);
  const sortedSaved = applyTypeFilter([...comingSoon, ...available], typeFilter);

  // Watching items are always TV (episode progress); type them so the Movies filter excludes them.
  const watchingList = applyTypeFilter(watching.items.map((i: any) => ({ ...i, media_type: 'tv' })), typeFilter);
  const favList      = applyTypeFilter(favorites.favorites, typeFilter);

  const handleShareList = async (list: any) => {
    try {
      const url = buildListShareUrl(list.id);
      await Share.share({ message: `My list "${list.name}" on PLOT. ${url}`, url });
    } catch { /* user dismissed the share sheet */ }
  };

  const isAll       = tab === 'all';
  const showWatching  = isAll || tab === 'watching';
  const showWant      = isAll || tab === 'want';
  const showFavs      = isAll || tab === 'favorites';
  const showLists     = isAll || tab === 'lists';

  // Expand/collapse-all scopes itself to the active tab, exactly as web does:
  // every section on "All", or just the one section the current tab shows
  // (tab ids match section ids 1:1). Web: MyListsView's relevantSectionIds.
  const relevantSectionIds = isAll ? LIST_SECTION_IDS : LIST_SECTION_IDS.filter(id => id === tab);
  const sectionsOpenForView = relevantSectionIds.length > 0
    && relevantSectionIds.every(id => sectionsOpen[id]);
  const toggleSectionsForView = () => {
    const next = !sectionsOpenForView;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSectionsOpen(prev => ({ ...prev, ...Object.fromEntries(relevantSectionIds.map(id => [id, next])) }));
    // CollapsibleSection persists on its own toggle, but a bulk change never
    // goes through it — write these directly or the choice is forgotten.
    relevantSectionIds.forEach(id => setSectionOpen(id, next));
  };

  const HEADER_H = insets.top + 148;

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
      >

        {/* ── Watching ── */}
        {showWatching && watchingList.length > 0 && (
          <CollapsibleSection
            id="watching"
            label="Watching"
            count={watchingList.length}
            open={sectionsOpen.watching}
            onOpenChange={(next) => setSectionOpenFor('watching', next)}
            headerRight={
              <SectionSelectActions
                sel={watchingSel}
                count={watchingList.length}
                deleteLabel={MEDIA.stopWatching}
                menuLabel="Watching options"
                onDelete={() => {
                  watchingSel.selected.forEach(tmdbId => watching.stopWatching(tmdbId));
                  watchingSel.exit();
                }}
              />
            }
          >
            {watchingList.map(item => (
              <ListRow key={item.tmdb_id} item={{ ...item, media_type: 'tv' }} sel={watchingSel} onPress={() => openPanel(item.tmdb_id, 'tv')} />
            ))}
          </CollapsibleSection>
        )}
        {tab === 'watching' && watching.items.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Not watching anything</Text>
            <Text style={styles.emptyBody}>Start a series from Want to Watch or Search.</Text>
          </View>
        )}

        {/* ── Want to Watch ── */}
        {showWant && (
          <CollapsibleSection
            id="want"
            label="Want to Watch"
            count={sortedSaved.length}
            open={sectionsOpen.want}
            onOpenChange={(next) => setSectionOpenFor('want', next)}
            headerRight={
              <SectionSelectActions
                sel={wantSel}
                count={sortedSaved.length}
                deleteLabel={MEDIA.removeFromWatchlist}
                menuLabel="Want to Watch options"
                onDelete={() => {
                  wantSel.selected.forEach(tmdbId => watchlist.removeFromList(tmdbId));
                  wantSel.exit();
                }}
              />
            }
          >
            {(
              sortedSaved.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyBody}>Tap the bookmark on any title to save it here.</Text>
                </View>
              ) : (
                sortedSaved.map(item => {
                  const rel  = countdownChip(item.release_date, colors);
                  const strm = countdownChip(item.streaming_date, colors);
                  return (
                    <ListRow
                      key={item.id}
                      item={item}
                      sel={wantSel}
                      onPress={() => item.tmdb_id && openPanel(item.tmdb_id, item.media_type === 'tv' ? 'tv' : 'movie')}
                      trailing={(rel || strm) ? (
                        <View style={styles.statusChips}>
                          {rel && (
                            <View style={[styles.statusChip, { backgroundColor: rel.color + '1F', borderColor: rel.color + '55' }]}>
                              <Text style={[styles.statusChipText, { color: rel.color }]}>{rel.label}</Text>
                            </View>
                          )}
                          {strm && (
                            <View style={[styles.statusChip, { backgroundColor: strm.color + '1F', borderColor: strm.color + '55' }]}>
                              <Text style={[styles.statusChipText, { color: strm.color }]}>Streaming {strm.label.toLowerCase()}</Text>
                            </View>
                          )}
                        </View>
                      ) : undefined}
                    />
                  );
                })
              )
            )}
          </CollapsibleSection>
        )}

        {/* ── Favourites ── */}
        {showFavs && (
          <CollapsibleSection
            id="favorites"
            label={fw.plural}
            count={favList.length}
            open={sectionsOpen.favorites}
            onOpenChange={(next) => setSectionOpenFor('favorites', next)}
            headerRight={
              <>
                <SectionSelectActions
                  sel={favSel}
                  count={favList.length}
                  deleteLabel={`${COMMON.remove} ${fw.pluralLower}`}
                  menuLabel={`${fw.plural} options`}
                  onDelete={() => {
                    favSel.selected.forEach(tmdbId => {
                      const item = favorites.favorites.find((f: any) => f.tmdb_id === tmdbId);
                      if (item) favorites.toggleFavorite({ ...item, id: undefined });
                    });
                    favSel.exit();
                  }}
                />
                <SectionAddButton onPress={() => setShowAddFav(true)} label={`Add to ${fw.pluralLower}`} />
              </>
            }
          >
            {(
              favList.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyBody}>{favorites.favorites.length === 0 ? 'Heart any title to add it here.' : 'No matching titles'}</Text>
                  <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddFav(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel={`Add to ${fw.pluralLower}`} accessibilityRole="button">
                    <Text style={{ color: colors.textMuted, fontSize: 20 }}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <PosterGrid
                  horizontal
                  items={favList}
                  sel={favSel}
                  onPress={(item) => item.tmdb_id && openPanel(item.tmdb_id, item.media_type === 'tv' ? 'tv' : 'movie')}
                  removeLabel={`${COMMON.remove} ${fw.nounLower}`}
                  onRemove={(tmdbId) => {
                    const item = favorites.favorites.find((f: any) => f.tmdb_id === tmdbId);
                    if (item) favorites.toggleFavorite({ ...item, id: undefined });
                  }}
                />
              )
            )}
          </CollapsibleSection>
        )}

        {/* ── My Lists ── */}
        {showLists && (
          <CollapsibleSection
            id="lists"
            label="My Lists"
            count={customLists.lists.length}
            open={sectionsOpen.lists}
            onOpenChange={(next) => setSectionOpenFor('lists', next)}
            headerRight={<SectionAddButton onPress={requestCreateList} label="Create list" />}
          >
            {(
              <>
                {!isAll && (
                  <TouchableOpacity style={styles.newListRow} onPress={requestCreateList}>
                    <Text style={styles.newListText}>+ New list</Text>
                  </TouchableOpacity>
                )}
                {customLists.lists.length === 0 && (
                  <View style={styles.empty}>
                    <Text style={styles.emptyBody}>Create your first custom list.</Text>
                    <TouchableOpacity style={styles.emptyAddBtn} onPress={requestCreateList} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Create list" accessibilityRole="button">
                      <Text style={{ color: colors.textMuted, fontSize: 20 }}>+</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {customLists.lists.map((list: any) => (
                  <CustomListCard
                    key={list.id}
                    list={list}
                    typeFilter={typeFilter}
                    onDelete={() => Alert.alert('Delete list?', `"${list.name}" will be removed.`, [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Delete', style: 'destructive', onPress: () => customLists.deleteList(list.id) },
                    ])}
                    onAddItem={() => setShowAddToList(list.id)}
                    onRemoveItem={(tmdbId) => customLists.removeItem(list.id, tmdbId)}
                    onSetPublic={(isPublic) => customLists.setListPublic(list.id, isPublic)}
                    onShare={() => handleShareList(list)}
                    onRename={(name) => customLists.renameList(list.id, name)}
                  />
                ))}
              </>
            )}
          </CollapsibleSection>
        )}
      </ScrollView>

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar title="My Lists" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.subTabsRow}
          style={styles.subTabsScroll}
        >
          {TABS.map(t => (
            <SubTab key={t.id} label={t.id === 'favorites' ? fw.plural : t.label} active={tab === t.id} onPress={() => setTab(t.id)} />
          ))}
        </ScrollView>
        <View style={styles.filterRow}>
          {(['all', 'movie', 'tv'] as TypeFilter[]).map(f => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, typeFilter === f && styles.filterChipActive]}
              onPress={() => setTypeFilter(f)}
              activeOpacity={0.7}
            >
              <Text style={[styles.filterChipText, typeFilter === f && styles.filterChipTextActive]}>
                {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'TV'}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          {relevantSectionIds.length > 0 && (
            <TouchableOpacity
              onPress={toggleSectionsForView}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={
                isAll
                  ? (sectionsOpenForView ? MEDIA.collapseAllSections : MEDIA.expandAllSections)
                  : (sectionsOpenForView ? 'Collapse section' : 'Expand section')
              }
            >
              <SectionToggleIcon collapse={sectionsOpenForView} />
            </TouchableOpacity>
          )}
        </View>
      </BlurView>

      {/* Modals */}
      {showAddFav && (
        <SearchPickModal
          title={`Add to ${fw.plural}`}
          historyEntries={history.entries}
          onSelect={(item) => favorites.toggleFavorite(item)}
          onClose={() => setShowAddFav(false)}
        />
      )}
      {showCreateList && (
        <CreateListModal
          onConfirm={(name) => { customLists.createList(name); setShowCreateList(false); }}
          onClose={() => setShowCreateList(false)}
        />
      )}
      {showAddToList && (
        <SearchPickModal
          title="Add to List"
          historyEntries={history.entries}
          onSelect={(item) => customLists.addItem(showAddToList, item)}
          onClose={() => setShowAddToList(null)}
        />
      )}

    </View>
  );
}

// ── Custom list card ──────────────────────────────────────────────────
function CustomListCard({
  list, onDelete, onAddItem, onRemoveItem, onSetPublic, onShare, onRename, typeFilter,
}: {
  list: any; onDelete: () => void; onAddItem: () => void; onRemoveItem: (tmdbId: number) => void;
  onSetPublic: (isPublic: boolean) => void; onShare: () => void; onRename: (name: string) => void; typeFilter: TypeFilter;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  const [open,     setOpen]     = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name,     setName]     = useState(list.name);
  const sel = useSelection();

  const items = applyTypeFilter(list.items || [], typeFilter);

  // Same item order as web's list kebab: Select, Rename, visibility, Share,
  // Delete. Deleting the list itself still goes through onDelete's confirm.
  const menuItems: KebabMenuItem[] = [
    ...((list.items || []).length > 0 ? [{ label: COMMON.select, onPress: sel.enter }] : []),
    { label: 'Rename', onPress: () => setRenaming(true) },
    { label: list.is_public ? COMMON.makePrivate : COMMON.makePublic, onPress: () => onSetPublic(!list.is_public) },
    ...(list.is_public ? [{ label: 'Share link', onPress: onShare }] : []),
    { label: COMMON.delete, onPress: onDelete, danger: true },
  ];

  return (
    <View style={styles.customList}>
      <TouchableOpacity style={styles.customListHeader} onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
        >
          <Polyline points="9,18 15,12 9,6" />
        </Svg>
        {renaming ? (
          <TextInput
            style={styles.renameInput}
            value={name}
            onChangeText={setName}
            autoFocus
            onBlur={() => {
              const next = name.trim();
              if (next && next !== list.name) onRename(next);
              else setName(list.name);
              setRenaming(false);
            }}
            onSubmitEditing={() => {
              const next = name.trim();
              if (next && next !== list.name) onRename(next);
              else setName(list.name);
              setRenaming(false);
            }}
            returnKeyType="done"
          />
        ) : (
          <Text style={styles.customListName} numberOfLines={1}>{list.name}</Text>
        )}
        {list.is_public && (
          <View style={styles.publicBadge}><Text style={styles.publicBadgeText}>Public</Text></View>
        )}
        <Text style={styles.customListCount}>{list.items?.length || 0}</Text>
        {sel.editMode ? (
          <>
            {sel.selected.size > 0 && (
              <TouchableOpacity
                onPress={() => {
                  sel.selected.forEach(tmdbId => onRemoveItem(tmdbId));
                  sel.exit();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginLeft: spacing.sm }}
                accessibilityLabel={`${MEDIA.removeFromList} (${sel.selected.size})`}
                accessibilityRole="button"
              >
                <TrashIcon color={colors.danger} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={sel.exit}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: spacing.sm }}
              accessibilityLabel={COMMON.done}
              accessibilityRole="button"
            >
              <Text style={styles.sectionActionText}>{COMMON.done}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={onAddItem} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Add item to list" accessibilityRole="button">
              <Text style={{ color: colors.textMuted, fontSize: 16, marginLeft: spacing.sm }}>+</Text>
            </TouchableOpacity>
            <KebabMenu accessibilityLabel={`Open options for ${list.name}`} items={menuItems} />
          </>
        )}
      </TouchableOpacity>

      {open && (
        items.length === 0 ? (
          <TouchableOpacity style={styles.empty} onPress={onAddItem}>
            <Text style={styles.emptyBody}>{(list.items?.length || 0) === 0 ? 'No items yet — tap + to add' : 'No matching titles'}</Text>
          </TouchableOpacity>
        ) : (
          <PosterGrid
            items={items}
            sel={sel}
            onPress={(item) => item.tmdb_id && openPanel(item.tmdb_id, item.media_type === 'tv' ? 'tv' : 'movie')}
            onRemove={onRemoveItem}
            removeLabel={MEDIA.removeFromList}
          />
        )
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  fixedHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    flexDirection: 'column',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.accentDim, borderColor: colors.accent + '55' },
  filterChipText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textMuted },
  filterChipTextActive: { color: colors.accent },
  publicBadge: {
    marginLeft: spacing.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.accent + '55',
    backgroundColor: colors.accent + '1F',
  },
  publicBadgeText: { fontFamily: fontFamily.sansBold, fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase', color: colors.accent },
  subTabsScroll: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  subTabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    alignItems: 'stretch',
  },

  subTab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  subTabUnderline: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 2,
    backgroundColor: 'transparent',
  },
  subTabUnderlineActive: { backgroundColor: colors.accent },
  subTabText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textMuted },
  subTabTextActive: { color: colors.accent },

  sectionAddBtn: { marginLeft: spacing.xs },
  sectionActionText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },

  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  listRowPoster: { width: 44, height: 66, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, flexShrink: 0 },
  listRowInfo: { flex: 1 },
  listRowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary, marginBottom: 4 },
  listRowMeta: { flexDirection: 'row', gap: spacing.sm },
  typeBadge: {},
  typeBadgeText: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  epChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.badge,
    backgroundColor: colors.chipEpisode + '1F',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.chipEpisode + '55',
  },
  epChipText: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    color: colors.chipEpisode,
    letterSpacing: 0.4,
  },
  statusChips: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  statusChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.badge,
    borderWidth: StyleSheet.hairlineWidth,
  },
  statusChipText: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.4 },

  posterGrid: { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md, gap: spacing.sm, paddingHorizontal: spacing.xl },
  posterRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  posterCard: { height: POSTER_H, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, marginBottom: spacing.xs },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  posterTitle: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted, textAlign: 'center' },

  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rankNum: { fontFamily: fontFamily.serif, fontSize: 22, width: 28, textAlign: 'center' },
  rankPoster: { width: 36, height: 54, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, flexShrink: 0 },
  rankEmptyPoster: { width: 36, height: 54, borderRadius: radii.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  rankEmptyPrompt: { flex: 1, fontFamily: fontFamily.serifItalic, fontSize: fontSize.sm, color: colors.textMuted },
  rankTitle: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  rankActions: { flexDirection: 'row', gap: 2 },
  rankActionBtn: { width: iconButtonSize.md, height: iconButtonSize.md, alignItems: 'center', justifyContent: 'center' },

  topTenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  topTenTypeLabel: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted },

  empty: { padding: spacing.xl, alignItems: 'center' },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  emptyAddBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },

  newListRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  newListText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },

  customList: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  customListHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  customListName: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary },
  customListCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  renameInput: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 2 },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  modalTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  modalSearch: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  modalSearchInput: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md },
  modalRowPoster: { width: 40, height: 60, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, flexShrink: 0 },
  modalRowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: 3 },
  modalRowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  modalEmpty: { padding: spacing.xl, textAlign: 'center', color: colors.textMuted, fontFamily: fontFamily.sans, fontSize: fontSize.sm },

  createModal: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg },
  createModalTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  createModalInput: { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  createModalBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.md, alignItems: 'center' },
});
