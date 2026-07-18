import { useState, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import {
  View, Text, ScrollView, FlatList, Image, TouchableOpacity, TextInput,
  Modal, StyleSheet, Dimensions, ActivityIndicator, Alert, Share,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Line, Circle } from 'react-native-svg';
import PlotLoader from '../../components/PlotLoader';
import HamburgerIcon from '../../components/HamburgerIcon';
import { useDrawer } from '../../contexts/DrawerContext';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useAppData } from '../../contexts/AppDataContext';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { tmdb } from '../../lib/tmdb';
import { favoriteWords } from '../../lib/spelling';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_W = Dimensions.get('window').width;
const POSTER_W = (SCREEN_W - spacing.xl * 2 - spacing.sm * 2) / 3;
const POSTER_H = POSTER_W * 1.5; // 2:3 — explicit height (aspectRatio collapses in a flex-wrap row on Fabric)

// Public custom-list share URL — mirrors web buildListShareUrl (/list/:id).
const SHARE_BASE = 'https://app.theplot.tv';
const buildListShareUrl = (listId: string) => `${SHARE_BASE}/list/${listId}`;

// Filter list items by media type. Items are treated as movies when untyped.
type TypeFilter = 'all' | 'movie' | 'tv';
const applyTypeFilter = (items: any[], filter: TypeFilter) =>
  filter === 'all' ? items : items.filter(i => (i.media_type || 'movie') === filter);

const TABS = [
  { id: 'all',       label: 'All'           },
  { id: 'watching',  label: 'Watching'      },
  { id: 'want',      label: 'Saved'         },
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

// ── Section header bar ────────────────────────────────────────────────
function SectionBar({
  label, count, open, onToggle, onAdd,
}: { label: string; count?: number; open: boolean; onToggle: () => void; onAdd?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <TouchableOpacity style={styles.sectionBar} onPress={onToggle} activeOpacity={0.7}>
      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
        style={{ transform: [{ rotate: open ? '90deg' : '0deg' }] }}
      >
        <Polyline points="9,18 15,12 9,6" />
      </Svg>
      <Text style={styles.sectionBarLabel}>{label}</Text>
      {count !== undefined && <Text style={styles.sectionBarCount}>{count}</Text>}
      {onAdd && (
        <TouchableOpacity
          style={styles.sectionAddBtn}
          onPress={(e) => { e.stopPropagation?.(); onAdd(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Line x1={12} y1={5} x2={12} y2={19} />
            <Line x1={5} y1={12} x2={19} y2={12} />
          </Svg>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ── List row ──────────────────────────────────────────────────────────
function ListRow({ item, trailing, onPress }: { item: any; trailing?: React.ReactNode; onPress?: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const img    = posterUrl(item.poster_path, 'w92');
  const title  = item.title || item.name || '';
  const isTV   = item.media_type === 'tv';
  const epCode = item.current_season != null
    ? `S${String(item.current_season).padStart(2,'0')}E${String(item.current_episode).padStart(2,'0')}`
    : null;

  return (
    <TouchableOpacity style={styles.listRow} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={styles.listRowPoster}>
        {img
          ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
        }
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
function PosterGrid({ items, onRemove, horizontal }: { items: any[]; onRemove?: (tmdbId: number) => void; horizontal?: boolean }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const renderCard = (item: any) => {
    const img = posterUrl(item.poster_path, 'w185');
    return (
      <View key={item.id || item.tmdb_id} style={{ width: POSTER_W }}>
        <View style={styles.posterCard}>
          {img
            ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
          }
          {onRemove && (
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemove(item.tmdb_id)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={{ color: '#fff', fontSize: 10, lineHeight: 14 }}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.posterTitle} numberOfLines={1}>{item.title || item.name}</Text>
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
  const { open: openPanel } = useMediaPanel();
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
  const { open } = useDrawer();
  const { open: openPanel } = useMediaPanel();
  const router  = useRouter();
  const { userId, watchlist, watching, favorites, customLists, history, profile } = useAppData();
  const fw = favoriteWords(profile?.region);

  const [tab,          setTab]          = useState('all');
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all');
  const [watchingOpen, setWatchingOpen] = useState(true);
  const [wantOpen,     setWantOpen]     = useState(true);
  const [favsOpen,     setFavsOpen]     = useState(true);
  const [listsOpen,    setListsOpen]    = useState(true);

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
  if (isLoading) return <PlotLoader />;

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
          <>
            {isAll && (
              <SectionBar
                label="Watching"
                count={watchingList.length}
                open={watchingOpen}
                onToggle={() => setWatchingOpen(o => !o)}
              />
            )}
            {(!isAll || watchingOpen) && watchingList.map(item => (
              <ListRow key={item.tmdb_id} item={{ ...item, media_type: 'tv' }} onPress={() => openPanel(item.tmdb_id, 'tv')} />
            ))}
          </>
        )}
        {tab === 'watching' && watching.items.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Not watching anything</Text>
            <Text style={styles.emptyBody}>Start a series from Want to Watch or Search.</Text>
          </View>
        )}

        {/* ── Want to Watch ── */}
        {showWant && (
          <>
            {isAll && (
              <SectionBar
                label="Want to Watch"
                count={sortedSaved.length}
                open={wantOpen}
                onToggle={() => setWantOpen(o => !o)}
              />
            )}
            {(!isAll || wantOpen) && (
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
          </>
        )}

        {/* ── Favourites ── */}
        {showFavs && (
          <>
            {isAll && (
              <SectionBar
                label={fw.plural}
                count={favList.length}
                open={favsOpen}
                onToggle={() => setFavsOpen(o => !o)}
                onAdd={() => setShowAddFav(true)}
              />
            )}
            {(!isAll || favsOpen) && (
              favList.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyBody}>{favorites.favorites.length === 0 ? 'Heart any title to add it here.' : 'No matching titles'}</Text>
                  <TouchableOpacity style={styles.emptyAddBtn} onPress={() => setShowAddFav(true)}>
                    <Text style={{ color: colors.textMuted, fontSize: 20 }}>+</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <PosterGrid
                  horizontal
                  items={favList}
                  onRemove={(tmdbId) => {
                    const item = favorites.favorites.find((f: any) => f.tmdb_id === tmdbId);
                    if (item) favorites.toggleFavorite({ ...item, id: undefined });
                  }}
                />
              )
            )}
          </>
        )}

        {/* ── My Lists ── */}
        {showLists && (
          <>
            {isAll && (
              <SectionBar
                label="My Lists"
                open={listsOpen}
                onToggle={() => setListsOpen(o => !o)}
                onAdd={requestCreateList}
              />
            )}
            {(!isAll || listsOpen) && (
              <>
                {!isAll && (
                  <TouchableOpacity style={styles.newListRow} onPress={requestCreateList}>
                    <Text style={styles.newListText}>+ New list</Text>
                  </TouchableOpacity>
                )}
                {customLists.lists.length === 0 && (
                  <View style={styles.empty}>
                    <Text style={styles.emptyBody}>Create your first custom list.</Text>
                    <TouchableOpacity style={styles.emptyAddBtn} onPress={requestCreateList}>
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
          </>
        )}
      </ScrollView>

      {/* Fixed blurred header */}
      <BlurView
        intensity={80}
        tint={resolved === 'dark' ? 'systemChromeMaterialDark' : 'systemChromeMaterialLight'}
        style={[styles.fixedHeader, { height: HEADER_H, paddingTop: insets.top }]}
      >
        <View style={styles.headerTitle}>
          <TouchableOpacity style={styles.hamburgerBtn} onPress={() => open()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <HamburgerIcon />
          </TouchableOpacity>
          <Text style={styles.screenTitle} pointerEvents="none">My Lists</Text>
          <TouchableOpacity style={styles.headerSearchBtn} onPress={() => router.push('/(app)/search')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={11} cy={11} r={7} />
              <Line x1={16.5} y1={16.5} x2={21} y2={21} />
            </Svg>
          </TouchableOpacity>
        </View>
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
  const [open,     setOpen]     = useState(true);
  const [renaming, setRenaming] = useState(false);
  const [name,     setName]     = useState(list.name);

  const items = applyTypeFilter(list.items || [], typeFilter);

  const openMenu = () => {
    const buttons: any[] = [
      { text: 'Rename', onPress: () => setRenaming(true) },
      { text: list.is_public ? 'Make private' : 'Make public', onPress: () => onSetPublic(!list.is_public) },
    ];
    if (list.is_public) buttons.push({ text: 'Share link', onPress: onShare });
    buttons.push({ text: 'Delete', style: 'destructive', onPress: onDelete });
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(list.name, list.is_public ? 'This list is public — anyone with the link can view it.' : '', buttons);
  };

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
        <TouchableOpacity onPress={onAddItem} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: colors.textMuted, fontSize: 16, marginLeft: spacing.sm }}>+</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={openMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ marginLeft: spacing.sm }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>···</Text>
        </TouchableOpacity>
      </TouchableOpacity>

      {open && (
        items.length === 0 ? (
          <TouchableOpacity style={styles.empty} onPress={onAddItem}>
            <Text style={styles.emptyBody}>{(list.items?.length || 0) === 0 ? 'No items yet — tap + to add' : 'No matching titles'}</Text>
          </TouchableOpacity>
        ) : (
          <PosterGrid items={items} onRemove={onRemoveItem} />
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
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  screenTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontFamily: fontFamily.serif,
    fontSize: fontSize.xl,
    color: colors.textPrimary,
  },
  headerSearchBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  hamburgerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
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

  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceRaised,
    gap: spacing.sm,
  },
  sectionBarLabel: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary, flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionBarCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  sectionAddBtn: { marginLeft: spacing.xs },

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
  rankActionBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },

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
