import PrivateNote from '../../components/PrivateNote';
import { buildListShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { shareLink } from '../../lib/share';
import { customListCreationError, isCustomListLimitError } from '@plot/core/customListCreation.js';
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { arrangeByMyListsOrder, normalizeUiPrefs } from '@plot/core/uiPrefs.js';
import { DISCOVER_VIEW } from '@plot/core/copy/discoverView.js';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity,
  Modal, StyleSheet, Dimensions, ActivityIndicator, Alert, LayoutAnimation,
} from 'react-native';
import { TextInput } from '../../components/TextInput';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Polyline, Line, Rect } from 'react-native-svg';
import PlotLoader from '@plot/ui/PlotLoader';
import ScreenHeaderBar from '../../components/ScreenHeaderBar';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useAppData } from '../../contexts/AppDataContext';
import { canCreateCustomList, isPremiumProfile } from '@plot/core/premium.js';
import { favoriteWords } from '../../lib/spelling';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import CollapsibleSection from '../../components/CollapsibleSection';
import ListCover, { NewListCover, COVER_GAP } from '../../components/ListCover';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { titleCount } from '@plot/core/listCollections.js';
import SectionToggleIcon from '../../components/SectionToggleIcon';
import SelectCircle from '../../components/SelectCircle';
import KebabMenu, { KebabMenuItem } from '../../components/KebabMenu';
import SearchPickModal from '../../components/SearchPickModal';
import { TopTenSection } from '../../components/TopTenSection';
import { MY_LISTS_TABS } from '@plot/core/navigation.js';
import { HISTORY_VIEW } from '@plot/core/copy/historyView.js';
import GroupedFilterMenu from '../../components/GroupedFilterMenu';
import { filterByType } from '@plot/core/mediaFilters.js';
import { filterByWatchStatus, isFinishedStatus, listProgress, listWatchStatus, LIST_STATUS_FILTER_IDS, type ListWatchStatus } from '@plot/core/listWatchStatus.js';
import WatchStatusChip from '../../components/WatchStatusChip';
import { myListsSearchSources, searchCollectionTitles, wantToWatchItems } from '@plot/core/listCollections.js';
import { localDateStr } from '@plot/core/date.js';
import { CUSTOM_LISTS } from '@plot/core/copy/customLists.js';
import { EVENTS, track } from '../../lib/analytics';
import { useLocalSearchParams, usePathname, useRouter, type Href } from 'expo-router';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import UpgradeSheet from '../../components/UpgradeSheet';
import HistorySection from '../../components/HistorySection';
import { groupEntriesByMonth, monthLabel } from '@plot/core/history.js';
import { filterEntries } from '@plot/core/historyStats.js';
import { drilldownParams, parseDrilldown, drilldownFilter, drilldownEventProps, type Drilldown } from '@plot/core/historyDrilldown.js';
import { getSectionOpen, setSectionOpen } from '../../lib/sectionOpenState';
import { MEDIA } from '@plot/core/copy/media.js';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useTheme } from '../../contexts/ThemeContext';
import { COMMON } from '@plot/core/copy/common.js';
import { PROFILE_PRIVACY } from '@plot/core/copy/profilePrivacy.js';
import { LIST_VISIBILITIES, listVisibility, isListShareable, type ListVisibility } from '@plot/core/customLists.js';
import { isSmartList, serialiseSmartListDraft, smartListDraftKey } from '@plot/core/smartLists.js';
import { SMART_LISTS } from '@plot/core/copy/smartLists.js';
import { useSmartListNewCounts } from '@plot/core/useSmartListSeen.js';
import { upgradeSheetContent } from '@plot/core/upgradeSheet.js';
import { readStorage, removeStorage, writeStorage } from '../../lib/storage';
import SmartListDialog from '../../components/smart/SmartListDialog';
import { asDraft, asNamedLists, asSmartRow, type SmartRules } from '../../lib/smartListModel';
import { addedById, isSharedList, joinNames, splitListsBySharing } from '@plot/core/sharedLists.js';
import { useUiPrefs } from '@plot/core/useUiPrefs.js';
import { personName } from '@plot/core/watchTogether.js';
import { WATCH_TOGETHER } from '@plot/core/copy/watchTogether.js';
import { COLLABORATIVE_LISTS } from '@plot/core/copy/collaborativeLists.js';
import { useListHostPremium } from '@plot/core/useListInvites.js';
import { SHOW_WATCH_TOGETHER } from '../../lib/launchFeatures';
import { AddPeopleSheet } from '../../components/watch/ShareListSheet';
import { ListInviteSheet } from '../../components/watch/ListInviteSheet';
import { openPremium } from '../../components/watch/WatchChrome';
import { createUndoBatch, UNDO_ACTIONS, type UndoOption } from '@plot/core/undo.js';
import { WATCHING_SORTS, parseWatchingSort, watchingSortKey, type WatchingSort } from '@plot/core/watchingOrder.js';
import { useWatchingSort } from '@plot/core/useWatchingSort.js';

const SCREEN_W = Dimensions.get('window').width;
const POSTER_W = (SCREEN_W - spacing.xl * 2 - spacing.sm * 2) / 3;
const POSTER_H = POSTER_W * 1.5; // 2:3 — explicit height (aspectRatio collapses in a flex-wrap row on Fabric)


// Filter list items by media type. Items are treated as movies when untyped.
// Mirrors web's ALL_LIST_SECTION_IDS (MyListsView.jsx). Tab ids match section
// ids 1:1, which is what lets the expand/collapse-all control scope itself to
// whichever tab is active.
const LIST_SECTION_IDS = ['watching', 'want', 'top10', 'favorites', 'lists'];
const SMART_SECTION_ID = 'smart';
// Height of the fixed header below the status bar: the title bar plus one row.
const SUBHEADER_H = 96;
// Which of web's My Lists sections (MY_LISTS_SECTION_IDS in uiPrefs.js) each
// mobile section belongs to. Watchlist, Favorites and custom lists are one
// Lists section there, so they move together here.
const sharedSectionOf = (id: string) => ({ watching: 'watching', top10: 'top', smart: 'smart', shared: 'shared' }[id] ?? 'lists');
// Shared lists, when Watch together is on: web's Shared section.
const SHARED_SECTION_ID = 'shared';
// Sections whose fold is saved to the profile (ui_prefs.myLists.collapsed), so
// folding one on web folds it here and the other way round. Watchlist and
// Favorites are covers inside web's Lists section and have no fold of their
// own there, so theirs stays on this device (lib/sectionOpenState.ts).
const FOLD_SYNCED: Record<string, string> = { watching: 'watching', top10: 'top', lists: 'lists', smart: 'smart', shared: 'shared' };

// Type filter options match web's, and the filtering itself runs through
// core's filterByType so `cinema` (a client-side flag, not a TMDB
// media_type) is handled the same way on both platforms.
const TYPE_OPTIONS = [
  { id: 'movie',  label: 'Movies' },
  { id: 'tv',     label: 'TV'     },
  { id: 'cinema', label: 'Cinema' },
];

// A title the My Lists search can open. History is not one of these:
// on web it left this page and keeps its own search.
type ListedTitle = {
  tmdb_id?: number | string;
  id?: number | string;
  media_type?: string;
  title?: string;
  name?: string;
  poster_path?: string | null;
  rank?: number;
  _cinema?: boolean;
};

// Tab list comes from the shared nav definition so web and mobile can't
// diverge on which tabs exist or their order. Favourites is region-spelled
// at the call site — it carries a null label here for exactly that reason.
const TABS = MY_LISTS_TABS;
const MY_LISTS_ALL_LABEL = 'All';

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
  sel, count, deleteLabel, menuLabel, onDelete, extraItems = [],
}: {
  sel: Selection;
  count: number;
  deleteLabel: string;
  menuLabel: string;
  onDelete: () => void;
  /** More menu rows after Select (the Watching sort). */
  extraItems?: KebabMenuItem[];
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
  return <KebabMenu accessibilityLabel={menuLabel} items={[{ label: COMMON.select, onPress: sel.enter }, ...extraItems]} />;
}

/** Sort menu label for each Watching order (same wording as web). */
const watchingSortLabel = (sort: WatchingSort) => (sort === 'title' ? CUSTOM_LISTS.titleAscending : CUSTOM_LISTS.watchingSort[sort]);

// ── List row ──────────────────────────────────────────────────────────
function ListRow({ item, trailing, onPress, sel, status }: {
  item: any;
  /** Where the viewer stands with the title; finished ones grey out. */
  status?: ListWatchStatus | null;
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Present when the row's section supports multi-select. */
  sel?: Selection;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const img    = posterUrl(displayPosterPath(art.apply(item)), 'w92');
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
  const finished = isFinishedStatus(status);

  return (
    <TouchableOpacity
      style={styles.listRow}
      onPress={handlePress}
      activeOpacity={handlePress ? 0.7 : 1}
      accessibilityLabel={editing ? `${isSelected ? COMMON.deselect : COMMON.select} ${title}` : undefined}
    >
      <View style={styles.listRowPoster}>
        {img
          ? <Image source={{ uri: img }} style={[StyleSheet.absoluteFill, finished && styles.finishedArt]} resizeMode="cover" />
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
        <Text style={[styles.listRowTitle, finished && styles.finishedTitle]} numberOfLines={2}>{title}</Text>
      </View>
      <View style={styles.typeBadge}>
        <Text style={styles.typeBadgeText}>{isTV ? 'Series' : 'Movie'}</Text>
      </View>
      {epCode && (
        <View style={styles.epChip}>
          <Text style={styles.epChipText}>{epCode}</Text>
        </View>
      )}
      <WatchStatusChip status={status} />
      {trailing}
    </TouchableOpacity>
  );
}

/** What a poster caption can read off a saved title. */
interface PosterCaptionItem {
  added_by?: string | null;
  current_season?: number | null;
  current_episode?: number | null;
  release_date?: string | null;
  streaming_date?: string | null;
}

// "S01E03" for a series with a current episode, else null (poster captions).
function episodeCode(item: { current_season?: number | null; current_episode?: number | null }): string | null {
  if (item.current_season == null) return null;
  return `S${String(item.current_season).padStart(2, '0')}E${String(item.current_episode ?? 0).padStart(2, '0')}`;
}

// The release or streaming countdown as a caption under a poster. A streaming
// date wins over a release date when both are ahead ("Streaming in 3 days").
// countdownChip only needs a palette for the chip colour, which captions skip.
const noPalette = {} as Palette;
function countdownPhrase(label: string): string {
  if (/^\d+ days$/.test(label)) return `in ${label}`;
  if (label === 'Today') return 'today';
  if (label === 'Tomorrow') return 'tomorrow';
  return label;
}
function releaseCaption(item: { release_date?: string | null; streaming_date?: string | null }): string | null {
  const strm = countdownChip(item.streaming_date, noPalette);
  if (strm) return `Streaming ${countdownPhrase(strm.label)}`;
  const rel = countdownChip(item.release_date, noPalette);
  return rel ? `Out ${countdownPhrase(rel.label)}` : null;
}

// One calm prompt for an empty section: says what belongs here and offers the
// next step (NN/g: status, teach, direct path), instead of blank slots.
function EmptyPrompt({ title, body, actionLabel, onPress }: { title: string; body: string; actionLabel: string; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.emptyPrompt} onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${title}. ${actionLabel}`}>
      <View style={{ flex: 1 }}>
        <Text style={styles.emptyPromptTitle}>{title}</Text>
        <Text style={styles.emptyPromptBody}>{body}</Text>
      </View>
      <Text style={styles.emptyPromptAction}>{actionLabel}</Text>
    </TouchableOpacity>
  );
}

// ── Poster grid ───────────────────────────────────────────────────────
function PosterGrid({ items, onRemove, horizontal, removeLabel = COMMON.remove, onPress, sel, caption, statusOf }: {
  items: any[];
  /** Where the viewer stands with a title; finished ones grey out. */
  statusOf?: (item: any) => ListWatchStatus | null;
  onRemove?: (tmdbId: number) => void;
  horizontal?: boolean;
  removeLabel?: string;
  onPress?: (item: any) => void;
  /** Present when the grid's section supports multi-select. */
  sel?: Selection;
  caption?: (item: PosterCaptionItem) => string | null;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const art = useUserArtwork();
  const editing = !!sel?.editMode;

  const renderCard = (item: any) => {
    const img   = posterUrl(displayPosterPath(art.apply(item)), 'w185');
    const title = item.title || item.name || '';
    const isSelected = !!sel?.selected.has(item.tmdb_id);
    const byline = caption?.(item);
    const status = statusOf?.(item) ?? null;
    const finished = isFinishedStatus(status);
    const handlePress = editing
      ? () => sel!.toggle(item.tmdb_id)
      : (onPress ? () => onPress(item) : undefined);

    return (
      <View key={`${item.media_type || 'movie'}:${item.tmdb_id ?? item.id}`} style={{ width: POSTER_W }}>
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
            ? <Image source={{ uri: img }} style={[StyleSheet.absoluteFill, finished && styles.finishedArt]} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
          }
          {status && <View style={styles.statusChipSlot} pointerEvents="none"><WatchStatusChip status={status} /></View>}
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
        <Text style={[styles.posterTitle, finished && styles.finishedTitle]} numberOfLines={1}>{title}</Text>
        {!!byline && <Text style={styles.posterCaption} numberOfLines={2}>{byline}</Text>}
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


// ── Create list modal ─────────────────────────────────────────────────
function CreateListModal({ onConfirm, onClose, onLimit }: { onConfirm: (name: string) => Promise<unknown>; onClose: () => void; onLimit?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const created = await onConfirm(name.trim());
      if (created) onClose();
      else setError(MEDIA.couldNotCreateList);
    } catch (failure) {
      if (onLimit && isCustomListLimitError(failure)) { onLimit(); return; }
      setError(customListCreationError(failure, MEDIA.couldNotCreateList));
    } finally {
      setBusy(false);
    }
  };
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
          editable={!busy}
          onSubmitEditing={submit}
        />
        {!!error && <Text accessibilityRole="alert" style={{ color: colors.textSecondary, marginBottom: spacing.sm }}>{error}</Text>}
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <TouchableOpacity
            disabled={busy || !name.trim()}
            style={[styles.createModalBtn, { flex: 1, backgroundColor: name.trim() ? colors.accent : colors.surfaceSunken }]}
            onPress={submit}
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
/** `history` is the History tab's own screen: the same body with the list tabs left out. */
export function MyListsScreen({ mode = 'lists' }: { mode?: 'lists' | 'history' }) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { open: openPanel } = useMediaPanel();
  const { userId, watchlist, watching, favorites, customLists, topLists, history, profile, refreshProfile } = useAppData();
  const ui = useUiPrefs({ userId, saved: profile?.ui_prefs, onPersisted: refreshProfile });
  const fw = favoriteWords(profile?.region);

  const shareRaw = useLocalSearchParams<{ share?: string | string[] }>().share;
  const sharePreset = (Array.isArray(shareRaw) ? shareRaw[0] : shareRaw) || null;
  // A History stat row sets stat/year/genre/weekday here, so the filtered list
  // can arrive from a link as well as a tap. Premium only.
  const router = useRouter();
  const routeParams = (useLocalSearchParams() as Record<string, string | string[] | undefined>);
  const premium = isPremiumProfile(profile);
  const drilldown = useMemo(
    () => (premium ? parseDrilldown({ get: (k: string) => (Array.isArray(routeParams[k]) ? routeParams[k]?.[0] : routeParams[k] as string | undefined) }) : null),
    [premium, routeParams],
  );
  const setDrilldown = (d: Drilldown) => {
    track(EVENTS.HISTORY_STAT_DRILLDOWN, drilldownEventProps(d, 'mobile'));
    router.setParams(drilldownParams(d));
  };
  const clearDrilldown = () => router.setParams({ stat: '', year: '', genre: '', weekday: '' });
  const [tab,          setTab]          = useState(mode === 'history' ? 'history' : 'all');
  const [topDragging, setTopDragging]  = useState(false);
  // A custom or shared list opened from its cover: the page shows that one
  // list, as web's cover opens the list's own page.
  const [openListId, setOpenListId] = useState<string | null>(null);
  // Top 5 shows one type at a time, behind a Movies / TV switch, as on web.
  const [topType, setTopType] = useState<'movies' | 'tv'>('movies');
  // ?share=<card> opens History on that card. The param holds the tab on
  // History until the sheet closes, so a cold link does not land on All.
  const viewTab = sharePreset ? 'history' : tab;
  const [typeFilters,  setTypeFilters]  = useState<string[]>([]);
  const today = useMemo(() => new Date(), []);
  const [historyYear,  setHistoryYear]  = useState(today.getFullYear());
  const [historyMonth, setHistoryMonth] = useState(today.getMonth());
  // Month groups come and go with the data, so they can't be driven by the
  // static sectionsOpen map — the bulk control signals them instead.
  const [historyExpand, setHistoryExpand] = useState<{ token: number; open: boolean } | null>(null);
  const [historyOpen,   setHistoryOpen]   = useState(true);
  // core's filterByType passes null/undefined straight through, which is the
  // right contract for it but not worth threading through every call site here.
  const byType = (items: any[]): any[] => (filterByType(items, typeFilters) ?? []) as any[];

  // Every month with activity, newest first, empty months skipped. The nav
  // widget's year/month is only "which month did we last jump to" — it does
  // not filter what renders, exactly as on web.
  const historyGroups = useMemo(
    () => groupEntriesByMonth(filterEntries(byType(history.entries || []), drilldownFilter(drilldown))) as any[],
    [history.entries, typeFilters, drilldown], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Section ids match web's ALL_LIST_SECTION_IDS so a section means the same
  // thing on both platforms and shares the `plot.section.<id>` storage key.
  // Seeded synchronously from the cache hydrated at app start.
  const [sectionsOpen, setSectionsOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries([...LIST_SECTION_IDS, SMART_SECTION_ID].map(id => [id, getSectionOpen(id, true)])));
  // A synced section is open unless the profile says it is folded; the rest
  // read this device's stored state.
  const foldedOnProfile: string[] = ui.prefs.myLists.collapsed;
  const isSectionOpen = (id: string) => (FOLD_SYNCED[id] ? !foldedOnProfile.includes(FOLD_SYNCED[id]) : sectionsOpen[id]);
  const setSectionOpenFor = (id: string, open: boolean) => {
    const synced = FOLD_SYNCED[id];
    if (!synced) { setSectionsOpen(prev => ({ ...prev, [id]: open })); return; }
    track(EVENTS.MY_LISTS_LAYOUT_CHANGED, { action: open ? 'expand' : 'collapse', section: synced });
    ui.foldMyLists([synced], !open);
  };

  // One edit state per selectable section. Independent, as on web: putting
  // Watching into select mode leaves Favourites alone.
  const watchingSel = useSelection();
  const wantSel     = useSelection();
  const favSel      = useSelection();

  const [showAddFav,     setShowAddFav]     = useState(false);
  const [showCreateList, setShowCreateList] = useState(false);
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [upgradeReason,  setUpgradeReason]  = useState<'lists' | 'smartLists'>('lists');
  const [showSmart,      setShowSmart]      = useState(false);
  const [smartDraft,     setSmartDraft]     = useState<{ name: string; rules: SmartRules } | null>(null);
  const [rulesKept,     setRulesKept]      = useState(false);
  const [showAddToList,  setShowAddToList]  = useState<string | null>(null);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => { pathRef.current = pathname; }, [pathname]);
  const smartRows = ((customLists.smartLists || []) as unknown[]).flatMap((row) => {
    const smart = asSmartRow(row);
    return smart ? [smart] : [];
  });
  const newCounts = useSmartListNewCounts(smartRows.map((row) => row.id), {
    enabled: premium && smartRows.length > 0,
  }) as Record<string, number>;

  // Free accounts get FREE_CUSTOM_LIST_CAP lists. Smart lists count toward
  // that cap, the same way the database counts them.
  const ownedCount = typeof customLists.ownedCount === 'number' ? customLists.ownedCount : customLists.lists.length;
  const requestCreateList = () => {
    if (!canCreateCustomList(ownedCount, profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setUpgradeReason('lists');
      setShowUpgrade(true);
      return;
    }
    setShowCreateList(true);
  };
  const [listQuery, setListQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  // The page's own search field stays out of the header until asked for: the
  // header's search button opens it here, and closing it clears the query.
  const [searchOpen, setSearchOpen] = useState(false);
  const requestSmartCreate = async () => {
    setRulesKept(false);
    const stored = await readStorage(smartListDraftKey(userId));
    setSmartDraft(asDraft(stored));
    setShowSmart(true);
  };
  const keepSmartDraft = async (name: string, rules: SmartRules) => {
    await writeStorage(smartListDraftKey(userId), serialiseSmartListDraft({ name, rules }));
    track(EVENTS.PREMIUM_GATE_HIT, { feature: 'smart_lists' });
    setRulesKept(true);
    setShowSmart(false);
    setUpgradeReason('smartLists');
    setShowUpgrade(true);
  };
  const handleSmartCreate = async (name: string, rules: SmartRules) => {
    let createdId = '';
    const created = await customLists.createSmartList(name, rules, {
      undo: true,
      onUndone: () => {
        if (!createdId || !pathRef.current.endsWith(`/smart-list/${createdId}`)) return;
        if (router.canGoBack()) router.back();
        else router.replace('/(app)/my-lists' as Href);
      },
    });
    const createdRow = created && typeof created === 'object' ? created as { id?: unknown } : null;
    const id = typeof createdRow?.id === 'string' ? createdRow.id : '';
    if (!id) return null;
    createdId = id;
    setRulesKept(false);
    await removeStorage(smartListDraftKey(userId));
    setShowSmart(false);
    router.push(`/(app)/smart-list/${id}` as Href);
    return created;
  };

  // The Watching order, kept on this device (there is no server prefs row for it).
  const [watchingSort, setWatchingSort] = useState<WatchingSort>('last_watched');
  useEffect(() => {
    let active = true;
    readStorage(watchingSortKey(userId)).then(stored => { if (active) setWatchingSort(parseWatchingSort(stored)); });
    return () => { active = false; };
  }, [userId]);
  const chooseWatchingSort = (next: WatchingSort) => {
    setWatchingSort(next);
    writeStorage(watchingSortKey(userId), next);
  };
  // The hook's rows are already last watched first and re-sorted after a tick.
  const sortedWatching = useWatchingSort(watching.items ?? [], watchingSort);

  const isLoading = watchlist.loading || watching.loading || favorites.loading || customLists.loading || topLists.loading;
  if (isLoading) return <PlotLoader backgroundColor={colors.bg} color={colors.textPrimary} />;

  const want = wantToWatchItems(watchlist.items, watching.items, localDateStr());
  const sortedSaved = byType(want);

  // While the field has text, the sections below are replaced by one result
  // grid. The type filter still narrows it. A blank field (including spaces)
  // leaves the page as it was.
  const searching = listQuery.trim().length > 0;
  const searchResults: ListedTitle[] = searching
    ? searchCollectionTitles(
        myListsSearchSources({
          watching: watching.items,
          topMovies: topLists.lists.movies,
          topTv: topLists.lists.tv,
          collections: [
            want,
            favorites.favorites,
            ...(customLists.lists as { items?: ListedTitle[] }[]).map(list => [...(list.items || [])].reverse()),
          ],
        }).map(items => (filterByType(items, typeFilters) ?? []) as ListedTitle[]),
        listQuery,
      )
    : [];

  // Watching items are always TV (episode progress); type them so the Movies filter excludes them.
  const watchingList = byType(sortedWatching.map((i: any) => ({ ...i, media_type: 'tv' })));
  const favList      = byType(favorites.favorites);

  const handleShareList = (list: { id: string; name: string; is_public: boolean; visibility?: string }) => shareLink({
    url: isListShareable(listVisibility(list), profile?.is_public) ? buildListShareUrl({ listId: list.id }) : null,
    title: `${list.name} · Plot`,
    text: SHARING.listText(list.name),
    event: EVENTS.LIST_SHARED,
    eventProps: { list_id: list.id },
  });

  const isAll       = viewTab === 'all';
  const showWatching  = isAll || viewTab === 'watching';
  // On All, Watchlist and Favorites are covers under Lists (web's layout);
  // each still has its own view, opened from its cover or the Show filter.
  const showWant      = viewTab === 'want';
  const showTop10     = isAll || viewTab === 'top10';
  const showFavs      = FAVOURITES_ENABLED && viewTab === 'favorites';
  const showLists     = isAll || viewTab === 'lists';
  // History is the one tab that isn't part of "All" — web scopes it the
  // same way, since a full watch history would bury every other section.
  const isHistory     = viewTab === 'history';

  const historyIndex = historyGroups.findIndex(
    (g: any) => g.year === historyYear && g.month === historyMonth);
  const canGoOlder = historyIndex === -1 ? historyGroups.length > 0 : historyIndex < historyGroups.length - 1;
  const canGoNewer = historyIndex > 0;

  const jumpTo = (g: any) => {
    if (!g) return;
    setHistoryYear(g.year);
    setHistoryMonth(g.month);
  };

  // Expand/collapse-all scopes itself to the active tab, exactly as web does:
  // every section on "All", or just the one section the current tab shows
  // (tab ids match section ids 1:1). Web: MyListsView's relevantSectionIds.
  const relevantSectionIds = isAll
    ? [...LIST_SECTION_IDS, SMART_SECTION_ID, SHARED_SECTION_ID]
    : tab === 'lists'
      ? ['lists', SMART_SECTION_ID, SHARED_SECTION_ID]
      : LIST_SECTION_IDS.filter(id => id === tab);
  const allManualLists = customLists.lists.filter((list: { rules?: unknown }) => !isSmartList(list));
  // Shared lists get their own section, split by who started them, as on web.
  // Off with Watch together, when every list is simply one of yours.
  const listSplit = SHOW_WATCH_TOGETHER
    ? splitListsBySharing(allManualLists, userId)
    : { own: allManualLists, sharedByMe: [], sharedWithMe: [] };
  const manualLists = listSplit.own;
  const hasShared = listSplit.sharedByMe.length + listSplit.sharedWithMe.length > 0;
  // The three posters a cover fans: the list's newest titles first.
  const coverPosters = (items: { poster_path?: string | null }[]) => items.slice(0, 3).map(item => item.poster_path);
  const listCover = (list: any) => {
    const items = [...(list.items || [])].reverse();
    const visibility = listVisibility(list);
    const others = (Array.isArray(list.people) ? list.people : []).filter((person: { user_id?: string }) => person.user_id !== userId);
    const names = others.map((person: { display_name?: string | null; username?: string | null }) => person.display_name || person.username || '').filter(Boolean);
    const owner = (Array.isArray(list.people) ? list.people : []).find((person: { user_id?: string }) => person.user_id === list.user_id);
    const ownerName = owner?.display_name || owner?.username || '';
    const byline = !names.length ? null
      : list.role === 'member' && ownerName ? COLLABORATIVE_LISTS.myLists.from(ownerName)
      : COLLABORATIVE_LISTS.myLists.withNames(names);
    return (
      <ListCover
        key={list.id}
        name={list.name}
        count={titleCount(items.length, 'Empty')}
        posters={coverPosters(items)}
        badge={visibility !== 'private' ? PROFILE_PRIVACY.listVisibilityBadge[visibility] : null}
        byline={byline}
        onPress={() => setOpenListId(list.id)}
      />
    );
  };
  const openList = openListId ? allManualLists.find((list: { id: string }) => list.id === openListId) ?? null : null;
  // Back to the whole page from one list or one section's own view.
  const backToAll = () => { setOpenListId(null); setTab('all'); };
  const renderListCard = (list: any) => (
    <CustomListCard
      key={list.id}
      list={list}
      typeFilters={typeFilters}
      onDelete={() => Alert.alert('Delete list?', `"${list.name}" will be removed.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => customLists.deleteList(list.id) },
      ])}
      onAddItem={() => setShowAddToList(list.id)}
      onRemoveItem={(tmdbId, opts) => customLists.removeItem(list.id, tmdbId, opts)}
      onSetVisibility={(visibility) => customLists.setListVisibility(list.id, visibility)}
      onShare={() => handleShareList(list)}
      onRename={(name) => customLists.renameList(list.id, name)}
    />
  );
  const keptNote = rulesKept ? upgradeSheetContent('smartLists', { kept: true })?.kept ?? null : null;
  const sectionsOpenForView = isHistory
    ? historyOpen
    : relevantSectionIds.length > 0 && relevantSectionIds.every(id => isSectionOpen(id));
  const toggleSectionsForView = () => {
    // History's sections are the month groups, which own their own state —
    // bump a token so they re-apply even when the value hasn't changed.
    if (isHistory) {
      const next = !historyOpen;
      setHistoryOpen(next);
      setHistoryExpand({ token: Date.now(), open: next });
      return;
    }
    const next = !sectionsOpenForView;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSectionsOpen(prev => ({ ...prev, ...Object.fromEntries(relevantSectionIds.map(id => [id, next])) }));
    const synced = relevantSectionIds.map(id => FOLD_SYNCED[id]).filter(Boolean);
    if (synced.length) ui.foldMyLists(synced, !next);
    // CollapsibleSection persists on its own toggle, but a bulk change never
    // goes through it — write these directly or the choice is forgotten.
    relevantSectionIds.forEach(id => setSectionOpen(id, next));
  };

  // The Show choices: every list tab except History, which has its own screen. The
  // favourites tab carries a null label in the shared list (region-spelled).
  // The sections in the viewer's saved order (Customize, or set on web). With
  // nothing saved this is mobile's own order. History is its own view, first.
  const sectionOrder = ['history', ...arrangeByMyListsOrder(
    normalizeUiPrefs(profile?.ui_prefs).myLists.order, [...LIST_SECTION_IDS, SHARED_SECTION_ID, SMART_SECTION_ID], sharedSectionOf)];
  const inOrder = (nodes: Record<string, ReactNode>) => sectionOrder.map(id => <Fragment key={id}>{nodes[id]}</Fragment>);

  // "6 lists · 24 titles", the line web's My Lists leads with: Watchlist,
  // Favorites, every custom and shared list, and smart lists, with the titles
  // on them (a smart list holds none until it is opened).
  const listsSummary = CUSTOM_LISTS.summary(
    1 + (FAVOURITES_ENABLED ? 1 : 0) + allManualLists.length + smartRows.length,
    sortedSaved.length + (FAVOURITES_ENABLED ? favList.length : 0)
      + allManualLists.reduce((n: number, list: { items?: unknown[] }) => n + (list.items?.length ?? 0), 0),
  );
  const listTabs = TABS.filter(t => t.id !== 'history').map(t => ({ id: t.id, label: t.label ?? fw.plural }));
  const searchPlaceholder = isHistory ? HISTORY_VIEW.searchPlaceholder : CUSTOM_LISTS.searchPlaceholder;
  const searchShown = searchOpen || listQuery.length > 0;
  // Title bar, one 40pt row of controls, and the search field only while open.
  // Calendar's header is the same height, so the three pages line up.
  const HEADER_H = insets.top + (searchShown ? SUBHEADER_H + 44 : SUBHEADER_H);

  return (
    <View style={styles.screen}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{ paddingTop: HEADER_H + 8, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        scrollEnabled={!topDragging}
      >

        {searching ? (
          <View>
            <Text style={styles.searchHeading}>{CUSTOM_LISTS.searchResults}</Text>
            <Text accessibilityLiveRegion="polite" style={styles.searchStatus}>
              {searchResults.length ? CUSTOM_LISTS.searchCount(searchResults.length) : CUSTOM_LISTS.noSearchResults}
            </Text>
            <PosterGrid
              items={searchResults}
              onPress={(item) => {
                const id = Number(item.tmdb_id ?? item.id);
                if (!Number.isFinite(id)) return;
                openPanel(id, item.media_type === 'tv' ? 'tv' : 'movie');
              }}
            />
          </View>
        ) : (
        <>
        {/* One list or one section on its own: a way back to the whole page,
            as web's list page has. */}
        {!isHistory && (openList || !isAll) && (
          <TouchableOpacity style={styles.backRow} onPress={backToAll} hitSlop={{ top: 8, bottom: 8 }} accessibilityRole="button" accessibilityLabel={CUSTOM_LISTS.backToMyLists}>
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Polyline points="15,18 9,12 15,6" />
            </Svg>
            <Text style={styles.backRowText}>{CUSTOM_LISTS.backToMyLists}</Text>
          </TouchableOpacity>
        )}
        {openList && !isHistory ? renderListCard(openList) : null}
        {/* Each section is a keyed piece so the viewer's saved order can place it
            (ui_prefs.myLists, shared with web). */}
        {!openList || isHistory ? inOrder({
          watching: (<>
        {/* ── Watching ── */}
        {showWatching && watchingList.length > 0 && (
          <CollapsibleSection
            id="watching"
            label="Watching"
            count={watchingList.length}
            open={isSectionOpen('watching')}
            onOpenChange={(next) => setSectionOpenFor('watching', next)}
            headerRight={
              <SectionSelectActions
                sel={watchingSel}
                count={watchingList.length}
                deleteLabel={MEDIA.stopWatching}
                menuLabel="Watching options"
                extraItems={watchingList.length > 1 ? WATCHING_SORTS.map(option => ({
                  label: watchingSortLabel(option),
                  checked: watchingSort === option,
                  onPress: () => chooseWatchingSort(option),
                })) : []}
                onDelete={async () => {
                  // One undo for the whole selection, offered once every stop lands.
                  const ids = [...watchingSel.selected];
                  const batch = createUndoBatch({ action: UNDO_ACTIONS.WATCHING_STOP });
                  watchingSel.exit();
                  await Promise.all(ids.map(tmdbId => watching.stopWatching(tmdbId, { undo: batch })));
                  batch.offer();
                }}
              />
            }
          >
            <PosterGrid
              horizontal
              items={watchingList.map(item => ({ ...item, media_type: 'tv' }))}
              sel={watchingSel}
              caption={(item) => episodeCode(item)}
              onPress={(item) => openPanel(item.tmdb_id, 'tv')}
            />
          </CollapsibleSection>
        )}
        {viewTab === 'watching' && watching.items.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Not watching anything</Text>
            <Text style={styles.emptyBody}>Start a series from your watchlist or Search.</Text>
          </View>
        )}

          </>),
          want: (<>
        {/* ── Want to Watch ── */}
        {showWant && (
          <CollapsibleSection
            id="want"
            label={CUSTOM_LISTS.wantToWatch}
            count={sortedSaved.length}
            open={sectionsOpen.want}
            onOpenChange={(next) => setSectionOpenFor('want', next)}
            headerRight={
              <SectionSelectActions
                sel={wantSel}
                count={sortedSaved.length}
                deleteLabel={MEDIA.removeFromWatchlist}
                menuLabel="Watchlist options"
                onDelete={async () => {
                  const ids = [...wantSel.selected];
                  const batch = createUndoBatch({ action: UNDO_ACTIONS.WATCHLIST_REMOVE });
                  wantSel.exit();
                  await Promise.all(ids.map(tmdbId => watchlist.removeFromList(tmdbId, { undo: batch })));
                  batch.offer();
                }}
              />
            }
          >
            {sortedSaved.length === 0 ? (
              <EmptyPrompt
                title={CUSTOM_LISTS.emptyPrompts.want.title}
                body={CUSTOM_LISTS.emptyPrompts.want.body}
                actionLabel={CUSTOM_LISTS.emptyPrompts.want.action}
                onPress={() => router.push('/(app)/search' as Href)}
              />
            ) : (
              <PosterGrid
                horizontal
                items={sortedSaved}
                sel={wantSel}
                caption={(item) => releaseCaption(item)}
                onPress={(item) => item.tmdb_id && openPanel(item.tmdb_id, item.media_type === 'tv' ? 'tv' : 'movie')}
              />
            )}
          </CollapsibleSection>
        )}

          </>),
          top10: (<>
        {/* ── Top 5 ── */}
        {showTop10 && (
          <CollapsibleSection
            id="top10"
            label="Top 5"
            open={isSectionOpen('top10')}
            onOpenChange={(next) => setSectionOpenFor('top10', next)}
          >
            <View style={styles.topSwitch} accessibilityRole="tablist">
              {(['movies', 'tv'] as const).map(type => {
                const on = topType === type;
                return (
                  <TouchableOpacity key={type} onPress={() => setTopType(type)} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.topSwitchTab, on && styles.topSwitchTabOn]}>
                    <Text style={[styles.topSwitchText, on && styles.topSwitchTextOn]}>{type === 'movies' ? MEDIA.movies : MEDIA.tv}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {topType === 'movies'
              ? <TopTenSection listType="movies" title="Movies"   showTitle={false} topLists={topLists} history={history.entries} onDraggingChange={setTopDragging} />
              : <TopTenSection listType="tv"     title="TV Shows" showTitle={false} topLists={topLists} history={history.entries} onDraggingChange={setTopDragging} />}
          </CollapsibleSection>
        )}

          </>),
          favorites: (<>
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
                  statusOf={(item) => listWatchStatus(item, history.entries, watching.items)}
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

          </>),
          history: (<>
        {/* ── History ── */}
        {isHistory && (
          <HistorySection
            groups={historyGroups}
            hasAnyEntries={(history.entries || []).length > 0}
            expandSignal={historyExpand}
            sharePreset={sharePreset}
            drilldown={drilldown}
            onDrilldown={premium ? setDrilldown : undefined}
            onUpgrade={premium ? undefined : () => router.push(PREMIUM_SETTINGS_PATH as Href)}
            onClearDrilldown={clearDrilldown}
            onSharePresetUsed={() => {
              setTab('history');
              router.setParams({ share: '' });
            }}
          />
        )}

          </>),
          lists: (<>
        {/* ── Lists ── On All: every list as a cover (Watchlist, Favorites,
            then your own), as on web. On the Lists view: each list in full. */}
        {showLists && isAll && (
          <CollapsibleSection
            id="lists"
            label={PUBLIC_PROFILE_PAGE.lists}
            open={isSectionOpen('lists')}
            onOpenChange={(next) => setSectionOpenFor('lists', next)}
            headerRight={<SectionAddButton onPress={requestCreateList} label="Create list" />}
          >
            <View style={styles.covers}>
              <ListCover
                name={CUSTOM_LISTS.wantToWatch}
                count={titleCount(sortedSaved.length, CUSTOM_LISTS.emptyPrompts.want.title)}
                posters={coverPosters(sortedSaved)}
                onPress={() => setTab('want')}
              />
              {FAVOURITES_ENABLED && (
                <ListCover
                  name={fw.plural}
                  count={titleCount(favList.length, 'Nothing hearted yet')}
                  posters={coverPosters(favList)}
                  onPress={() => setTab('favorites')}
                />
              )}
              {manualLists.map(listCover)}
              <NewListCover label="New list" onPress={requestCreateList} />
            </View>
          </CollapsibleSection>
        )}
        {showLists && !isAll && (
          <CollapsibleSection
            id="lists"
            label="My Lists"
            count={manualLists.length}
            open={isSectionOpen('lists')}
            onOpenChange={(next) => setSectionOpenFor('lists', next)}
            headerRight={<SectionAddButton onPress={requestCreateList} label="Create list" />}
          >
            <TouchableOpacity style={styles.newListRow} onPress={requestCreateList}>
              <Text style={styles.newListText}>+ New list</Text>
            </TouchableOpacity>
            {manualLists.length === 0 && (
              <EmptyPrompt
                title={CUSTOM_LISTS.emptyPrompts.lists.title}
                body={CUSTOM_LISTS.emptyPrompts.lists.body}
                actionLabel={CUSTOM_LISTS.emptyPrompts.lists.action}
                onPress={requestCreateList}
              />
            )}
            {manualLists.map(renderListCard)}
          </CollapsibleSection>
        )}

          </>),
          shared: (<>
        {/* ── Shared (web's Shared section). Only once there is a shared list:
            starting one is Invite people on a list's own menu, so an empty
            section here would offer nothing to press. ── */}
        {showLists && hasShared && (
          <CollapsibleSection
            id={SHARED_SECTION_ID}
            label={COLLABORATIVE_LISTS.myLists.shared}
            count={listSplit.sharedByMe.length + listSplit.sharedWithMe.length}
            open={isSectionOpen(SHARED_SECTION_ID)}
            onOpenChange={(next) => setSectionOpenFor(SHARED_SECTION_ID, next)}
          >
            {listSplit.sharedByMe.length > 0 && <Text style={styles.sharedGroupLabel} accessibilityRole="header">{COLLABORATIVE_LISTS.myLists.sharedByMe}</Text>}
            {isAll ? <View style={styles.covers}>{listSplit.sharedByMe.map(listCover)}</View> : listSplit.sharedByMe.map(renderListCard)}
            {listSplit.sharedWithMe.length > 0 && <Text style={styles.sharedGroupLabel} accessibilityRole="header">{COLLABORATIVE_LISTS.myLists.sharedWithMe}</Text>}
            {isAll ? <View style={styles.covers}>{listSplit.sharedWithMe.map(listCover)}</View> : listSplit.sharedWithMe.map(renderListCard)}
          </CollapsibleSection>
        )}
          </>),
          smart: (<>
        {showLists && (
          <CollapsibleSection
            id={SMART_SECTION_ID}
            label={SMART_LISTS.section}
            count={smartRows.length}
            open={isSectionOpen('smart')}
            onOpenChange={(next) => setSectionOpenFor(SMART_SECTION_ID, next)}
            headerRight={<SectionAddButton onPress={requestSmartCreate} label={SMART_LISTS.newSmartList} />}
          >
            {!!keptNote && <Text style={styles.smartKept} accessibilityLiveRegion="polite">{keptNote}</Text>}
            <View style={styles.covers}>
              {smartRows.map((row) => {
                const fresh = newCounts[row.id];
                return (
                  <ListCover
                    key={row.id}
                    name={row.name}
                    count={SMART_LISTS.coverCount}
                    posters={[]}
                    trailing={typeof fresh === 'number' && fresh > 0 ? <Text style={styles.smartNew}>{SMART_LISTS.newCount(fresh)}</Text> : null}
                    onPress={() => router.push(`/(app)/smart-list/${row.id}` as Href)}
                  />
                );
              })}
              <NewListCover label={SMART_LISTS.newSmartList} note={SMART_LISTS.newTileNote} onPress={requestSmartCreate} />
            </View>
          </CollapsibleSection>
        )}
          </>),
        }) : null}
        </>
        )}
      </ScrollView>

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <ScreenHeaderBar
          title={mode === 'history' ? 'History' : 'My Lists'}
          searchLabel={searchPlaceholder}
          onSearchPress={() => { if (searchShown) { setListQuery(''); setSearchOpen(false); } else setSearchOpen(true); }}
        />
        {/* Tabs and the filter/collapse controls share one row, as on web —
            the old second row of All/Movies/TV chips is gone. */}
        <View style={styles.tabsRow}>
          {isHistory ? (
            // History's title is already in the bar above, so this row leads
            // with the month switcher instead of repeating the page name.
            <View style={styles.rowLead}>
              {!searching && historyGroups.length > 0 && (
              <View style={styles.monthNav}>
                <TouchableOpacity
                  onPress={() => jumpTo(historyIndex === -1 ? historyGroups[0] : historyGroups[historyIndex + 1])}
                  disabled={!canGoOlder}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to an older month"
                >
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={canGoOlder ? colors.textSecondary : colors.borderStrong} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Polyline points="15,18 9,12 15,6" />
                  </Svg>
                </TouchableOpacity>
                <Text style={styles.monthNavLabel}>{monthLabel(historyYear, historyMonth, 'short')}</Text>
                <TouchableOpacity
                  onPress={() => jumpTo(historyGroups[historyIndex - 1])}
                  disabled={!canGoNewer}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Jump to a more recent month"
                >
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={canGoNewer ? colors.textSecondary : colors.borderStrong} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Polyline points="9,18 15,12 9,6" />
                  </Svg>
                </TouchableOpacity>
              </View>
              )}
            </View>
          ) : (
            <Text style={styles.viewLabel} numberOfLines={1} accessibilityRole="header">
              {openList ? openList.name : isAll ? listsSummary : (listTabs.find(t => t.id === tab)?.label ?? MY_LISTS_ALL_LABEL)}
            </Text>
          )}
          <View style={styles.tabsRowActions}>
            {/* Customize sits in the top row on the All view, as on web's
                phone layout, so it is reachable without scrolling. */}
            {!isHistory && isAll && !openList && (
              <TouchableOpacity onPress={() => router.push('/(app)/my-lists-layout' as Href)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={CUSTOM_LISTS.sections.title}>
                <Text style={styles.customizeText}>{DISCOVER_VIEW.customize.action}</Text>
              </TouchableOpacity>
            )}
            {/* ‹ Mar 2026 › — jumps to the adjacent month that actually has
                entries, so empty months are never a dead step. */}
            <GroupedFilterMenu
              accessibilityLabel="Filter lists"
              groups={[
                ...(mode === 'history' ? [] : [{
                  heading: 'Show',
                  mode: 'single' as const,
                  options: listTabs.map(t => ({ id: t.id, label: t.label })),
                  value: [tab],
                  defaultValue: ['all'],
                  onChange: ([next]: string[]) => {
                    if (!next) return;
                    if (sharePreset) router.setParams({ share: '' });
                    setTab(next);
                  },
                }]),
                {
                  heading: 'Type',
                  options: TYPE_OPTIONS,
                  value: typeFilters,
                  onChange: setTypeFilters,
                },
              ]}
            />
            {!searching && (relevantSectionIds.length > 0 || (isHistory && historyGroups.length > 0)) && (
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
        </View>
        {searchShown && (
        <View style={[styles.listSearch, searchFocused && { borderColor: colors.accent }]}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={11} cy={11} r={7} />
            <Line x1={16.5} y1={16.5} x2={21} y2={21} />
          </Svg>
          <TextInput
            style={styles.listSearchInput}
            value={listQuery}
            onChangeText={setListQuery}
            placeholder={searchPlaceholder}
            autoFocus
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={searchPlaceholder}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          {listQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setListQuery('')}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={COMMON.clearSearch}
            >
              <Text style={styles.listSearchClear}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        )}
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
      <UpgradeSheet visible={showUpgrade} reason={upgradeReason} onClose={() => setShowUpgrade(false)} onCompare={() => router.push(PREMIUM_SETTINGS_PATH as Href)} />
      {showCreateList && (
        <CreateListModal
          onConfirm={(name) => customLists.createList(name)}
          onClose={() => setShowCreateList(false)}
          onLimit={() => { setShowCreateList(false); setUpgradeReason('lists'); setShowUpgrade(true); }}
        />
      )}
      {showSmart && (
        <SmartListDialog
          initial={smartDraft}
          lists={asNamedLists([...(customLists.lists || []), ...(customLists.smartLists || [])])}
          premium={premium}
          onConfirm={handleSmartCreate}
          onClose={() => setShowSmart(false)}
          onPremium={() => { setShowSmart(false); setUpgradeReason('smartLists'); setShowUpgrade(true); }}
          onLocked={keepSmartDraft}
          onLimit={() => { setShowSmart(false); setUpgradeReason('lists'); setShowUpgrade(true); }}
        />
      )}
      {showAddToList && (
        <SearchPickModal
          title="Add to List"
          historyEntries={history.entries}
          onSelect={(item) => {
            const blocked = smartRows.some((row) => row.id === showAddToList)
              || customLists.lists.some((list: { id?: string; rules?: unknown }) => list.id === showAddToList && isSmartList(list));
            if (blocked) {
              Alert.alert(SMART_LISTS.badge, SMART_LISTS.kinds.smart.body);
              return;
            }
            customLists.addItem(showAddToList, item);
          }}
          onClose={() => setShowAddToList(null)}
        />
      )}

    </View>
  );
}

// ── Custom list card ──────────────────────────────────────────────────
function CustomListCard({
  list, onDelete, onAddItem, onRemoveItem, onSetVisibility, onShare, onRename, typeFilters,
}: {
  list: any; onDelete: () => void; onAddItem: () => void; onRemoveItem: (tmdbId: number, opts?: { undo?: UndoOption }) => unknown;
  onSetVisibility: (visibility: ListVisibility) => void; onShare: () => void; onRename: (name: string) => void; typeFilters: string[];
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { open: openPanel } = useMediaPanel();
  const { profile, userId, customLists, history, watching } = useAppData();
  const router = useRouter();
  const [open,     setOpen]     = useState(true);
  const [statusFilters, setStatusFilters] = useState<string[]>([]);
  const [view, setView] = useState<'grid' | 'rows'>('grid');
  const [renaming, setRenaming] = useState(false);
  const [name,     setName]     = useState(list.name);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUpgrade, setInviteUpgrade] = useState(false);
  const sel = useSelection();
  const shared = SHOW_WATCH_TOGETHER && isSharedList(list, userId);
  const member = shared && list.role === 'member';
  const hostPremium = useListHostPremium(list.id, { enabled: shared });
  const people = Array.isArray(list.people) ? list.people : [];
  const otherNames = people
    .filter((person: { user_id?: string }) => !!person.user_id && person.user_id !== userId)
    .map((person: { display_name?: string | null; username?: string | null }) => personName(person));
  const sharedLine = shared && otherNames.length ? WATCH_TOGETHER.sharedList.sharedWith(joinNames(otherNames)) : '';
  const ownerId = typeof list.user_id === 'string' ? list.user_id : null;
  const addedCaption = shared
    ? (item: { added_by?: string | null }) => {
        const by = addedById(item, ownerId);
        if (!by) return null;
        if (by === userId) return WATCH_TOGETHER.sharedList.addedByYou;
        const who = people.find((person: { user_id?: string; display_name?: string | null; username?: string | null }) => person.user_id === by);
        return who ? WATCH_TOGETHER.sharedList.addedBy(personName(who)) : null;
      }
    : undefined;

  const statusOf = (item: any) => listWatchStatus(item, history.entries, watching.items) as ListWatchStatus | null;
  const progress = listProgress(list.items || [], history.entries, watching.items) as { total: number; watched: number; percent: number };
  const items = filterByWatchStatus(
    (filterByType(list.items || [], typeFilters) ?? []) as any[], statusFilters, history.entries, watching.items,
  ) as any[];
  const visibility = listVisibility(list);
  const shareable = isListShareable(visibility, profile?.is_public);
  const confirmLeave = () => {
    Alert.alert(WATCH_TOGETHER.sharedList.leaveTitle(list.name), WATCH_TOGETHER.sharedList.leaveBody, [
      { text: COMMON.cancel, style: 'cancel' },
      { text: WATCH_TOGETHER.sharedList.leave, style: 'destructive', onPress: () => { void customLists.leaveList(list.id); } },
    ]);
  };

  const openInvite = () => {
    if (!isPremiumProfile(profile)) {
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'collaborative_lists' });
      setInviteUpgrade(true);
      return;
    }
    setInviteOpen(true);
  };

  // Same item order as web's list kebab: Select, Rename, visibility, Share,
  // Delete. Invite people sits with Share while Watch together is on.
  // A member adds people or leaves instead of deleting.
  const menuItems: KebabMenuItem[] = member ? [
    ...((list.items || []).length > 0 ? [{ label: COMMON.select, onPress: sel.enter }] : []),
    { label: COLLABORATIVE_LISTS.myLists.rename, onPress: () => setRenaming(true) },
    { label: WATCH_TOGETHER.sharedList.addPeople, onPress: () => setPeopleOpen(true) },
    { label: WATCH_TOGETHER.sharedList.leave, onPress: confirmLeave, danger: true },
  ] : [
    ...((list.items || []).length > 0 ? [{ label: COMMON.select, onPress: sel.enter }] : []),
    { label: 'Rename', onPress: () => setRenaming(true) },
    ...LIST_VISIBILITIES.map((v) => ({
      label: PROFILE_PRIVACY.listVisibility[v], checked: v === visibility,
      onPress: () => { if (v !== visibility) onSetVisibility(v); },
    })),
    ...(shareable ? [{ label: 'Share link', onPress: onShare }] : []),
    ...(SHOW_WATCH_TOGETHER ? [{ label: COLLABORATIVE_LISTS.invite, onPress: openInvite }] : []),
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
        <View style={{ flex: 1, minWidth: 0 }}>
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
            <Text style={[styles.customListName, { flex: 0 }]} numberOfLines={1}>{list.name}</Text>
          )}
          {!!sharedLine && <Text style={styles.sharedLine} numberOfLines={1}>{sharedLine}</Text>}
        </View>
        {!member && visibility !== 'private' && (
          <View style={styles.publicBadge}><Text style={styles.publicBadgeText}>{PROFILE_PRIVACY.listVisibilityBadge[visibility]}</Text></View>
        )}
        {shared && (
          <View style={styles.publicBadge}><Text style={styles.publicBadgeText}>{WATCH_TOGETHER.sharedList.shared}</Text></View>
        )}
        <Text style={styles.customListCount}>{list.items?.length || 0}</Text>
        {sel.editMode ? (
          <>
            {sel.selected.size > 0 && (
              <TouchableOpacity
                onPress={async () => {
                  const ids = [...sel.selected];
                  const batch = createUndoBatch({ action: UNDO_ACTIONS.LIST_ITEM_REMOVE });
                  sel.exit();
                  await Promise.all(ids.map(tmdbId => onRemoveItem(tmdbId, { undo: batch })));
                  batch.offer({ meta: { listName: list.name } });
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
            {shareable && !member && <TouchableOpacity onPress={(event) => { event.stopPropagation(); onShare(); }} accessibilityRole="button" accessibilityLabel={COMMON.share} style={{ marginRight: spacing.sm }}>
              <Text style={styles.sectionActionText}>{COMMON.share}</Text>
            </TouchableOpacity>}
            <TouchableOpacity onPress={onAddItem} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Add item to list" accessibilityRole="button">
              <Text style={{ color: colors.textMuted, fontSize: 16, marginLeft: spacing.sm }}>+</Text>
            </TouchableOpacity>
            <KebabMenu accessibilityLabel={`Open options for ${list.name}`} items={menuItems} />
          </>
        )}
      </TouchableOpacity>

      {open && progress.total > 0 && (
        <View style={styles.listToolbar}>
          <View style={styles.progressWrap}>
            <View style={styles.progressTrack} accessibilityRole="progressbar" accessibilityLabel={MEDIA.listProgress(progress.watched, progress.total)} accessibilityValue={{ min: 0, max: 100, now: progress.percent }}>
              <View style={[styles.progressFill, { width: `${progress.percent}%` }]} />
            </View>
            <Text style={styles.progressLabel}>{MEDIA.listProgress(progress.watched, progress.total)}</Text>
          </View>
          <GroupedFilterMenu
            accessibilityLabel="Filter by status"
            groups={[{
              heading: MEDIA.statusHeading,
              options: LIST_STATUS_FILTER_IDS.map((id: string) => ({ id, label: MEDIA.watchStatus[id as keyof typeof MEDIA.watchStatus] })),
              value: statusFilters,
              onChange: setStatusFilters,
            }]}
          />
          <TouchableOpacity
            onPress={() => setView(v => (v === 'grid' ? 'rows' : 'grid'))}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={view === 'grid' ? CUSTOM_LISTS.listView : CUSTOM_LISTS.gridView}
          >
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {view === 'grid'
                ? <><Rect x={3} y={5} width={5.5} height={5.5} rx={1.5} /><Rect x={3} y={13.5} width={5.5} height={5.5} rx={1.5} /><Path d="M12 6.5h9M12 9.5h6M12 15h9M12 18h6" /></>
                : <><Rect x={4} y={4} width={7} height={7} rx={1.5} /><Rect x={13} y={4} width={7} height={7} rx={1.5} /><Rect x={4} y={13} width={7} height={7} rx={1.5} /><Rect x={13} y={13} width={7} height={7} rx={1.5} /></>}
            </Svg>
          </TouchableOpacity>
        </View>
      )}

      {open && (
        items.length === 0 ? (
          <TouchableOpacity style={styles.empty} onPress={onAddItem}>
            <Text style={styles.emptyBody}>{(list.items?.length || 0) === 0 ? 'No items yet — tap + to add' : 'No matching titles'}</Text>
          </TouchableOpacity>
        ) : view === 'rows' ? (
          <View>
            {items.map(item => (
              <ListRow
                key={`${item.media_type || 'movie'}:${item.tmdb_id ?? item.id}`}
                item={item}
                sel={sel}
                status={statusOf(item)}
                onPress={() => item.tmdb_id && openPanel(item.tmdb_id, item.media_type === 'tv' ? 'tv' : 'movie')}
              />
            ))}
          </View>
        ) : (
          <PosterGrid
            items={items}
            sel={sel}
            statusOf={statusOf}
            caption={addedCaption}
            onPress={(item) => item.tmdb_id && openPanel(item.tmdb_id, item.media_type === 'tv' ? 'tv' : 'movie')}
            onRemove={(tmdbId: number) => onRemoveItem(tmdbId, { undo: true })}
            removeLabel={MEDIA.removeFromList}
          />
        )
      )}
      {peopleOpen && (
        <AddPeopleSheet listId={list.id} people={people} locked={hostPremium === false} onClose={() => setPeopleOpen(false)} />
      )}
      {inviteOpen && (
        <ListInviteSheet listId={list.id} listName={list.name} people={people} onClose={() => setInviteOpen(false)} />
      )}
      <UpgradeSheet
        visible={inviteUpgrade}
        reason="collaborativeLists"
        onClose={() => setInviteUpgrade(false)}
        onCompare={() => openPremium(router)}
      />
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },

  // One row of controls under the title bar, the same height and gutters on
  // My Lists, History and Calendar. No rule above it: the title bar and this
  // row are one header, closed by the header's own bottom hairline.
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    paddingRight: spacing.xl,
  },
  rowLead: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xl },
  tabsRowActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthNav: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  monthNavLabel: {
    fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs,
    color: colors.textSecondary, minWidth: 54, textAlign: 'center',
  },
  // 44 leaves room for the tab label plus its underline; the previous height
  // clipped descenders on "Watching"/"Want to Watch".
  viewLabel: { flex: 1, paddingHorizontal: spacing.xl, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  subTabsScroll: { flex: 1, height: 44 },
  subTabsRow: { paddingHorizontal: spacing.xl, alignItems: 'center' },
  listSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 36,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  listSearchInput: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textPrimary,
  },
  listSearchClear: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  searchHeading: {
    fontFamily: fontFamily.display,
    fontSize: fontSize.xl,
    letterSpacing: -0.6,
    lineHeight: 23,
    color: colors.textPrimary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  searchStatus: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textSecondary,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
  },

  fixedHeader: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 100,
    flexDirection: 'column',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
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
  listToolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  progressWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accentSecondary },
  progressLabel: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  statusChipSlot: { position: 'absolute', top: 6, left: 6 },
  finishedArt: { opacity: 0.45 },
  finishedTitle: { color: colors.textMuted },
  removeBtn: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  posterTitle: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  posterCaption: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textSecondary, textAlign: 'center' },
  sharedLine: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },

  emptyPrompt: {
    marginHorizontal: spacing.xl, marginVertical: spacing.sm, padding: spacing.lg,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    borderRadius: radii.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong,
  },
  emptyPromptTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  emptyPromptBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  emptyPromptAction: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
  empty: { padding: spacing.xl, alignItems: 'center' },
  covers: { flexDirection: 'row', flexWrap: 'wrap', gap: COVER_GAP, rowGap: spacing.xl, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  backRowText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  topSwitch: { flexDirection: 'row', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  topSwitchTab: { paddingBottom: 3, borderBottomWidth: 1.5, borderBottomColor: 'transparent' },
  topSwitchTabOn: { borderBottomColor: colors.accent },
  topSwitchText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textMuted },
  topSwitchTextOn: { color: colors.textPrimary },
  sharedGroupLabel: { marginHorizontal: spacing.xl, marginTop: spacing.md, marginBottom: spacing.sm, fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.9, textTransform: 'uppercase', color: colors.textMuted },
  customizeText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textMuted },
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.sm },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center' },
  emptyAddBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },

  newListRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  newListText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
  smartNewRow: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 2 },
  smartNote: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  smartKept: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  smartRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.sm },
  smartRowText: { flex: 1 },
  smartRowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  smartRowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  smartNew: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.accentText },

  customList: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  customListHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, gap: spacing.sm },
  customListName: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary },
  customListCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  renameInput: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, borderBottomWidth: 1, borderBottomColor: colors.accent, paddingVertical: 2 },

  // Modal styles
  modalContainer: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  modalTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  modalTabs: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  modalSearch: { paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  modalSearchInput: { backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  modalRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md },
  modalRowPoster: { width: 40, height: 60, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceSunken, flexShrink: 0 },
  modalRowTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: 3 },
  modalRowMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  modalEmpty: { padding: spacing.xl, textAlign: 'center', color: colors.textMuted, fontFamily: fontFamily.sans, fontSize: fontSize.sm },

  createModal: { flex: 1, backgroundColor: colors.bg, padding: spacing.xl, gap: spacing.lg },
  createModalTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  createModalInput: { backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary, borderWidth: 1, borderColor: colors.border },
  createModalBtn: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, borderRadius: radii.md, alignItems: 'center' },
});

export default function MyListsRoute() {
  return <MyListsScreen mode="lists" />;
}
