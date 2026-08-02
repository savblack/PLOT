/**
 * MediaPanel — slide-up detail sheet, mobile port of web MediaPanel.jsx.
 * Sections: backdrop → title/meta → actions → watching/watched → where to watch → episodes (TV)
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Dimensions, ActivityIndicator, TextInput, Animated, Share, Linking, Alert,
} from 'react-native';
import Svg, { Path, Line, Polyline, Circle, Polygon, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tmdb, getTmdbRegion } from '../lib/tmdb';
import { backdropUrl, posterUrl, logoUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { favoriteWords } from '../lib/spelling';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { buildWatchLink } from '@plot/core/watchLinks.js';
import { fetchVerifiedAvailability, offersFromTmdb } from '@plot/core/availability.js';
import { fetchCriticScore, pickAudienceQuote, getConsensusLine } from '@plot/core/reviews.js';
import { canCreateCustomList, FREE_CUSTOM_LIST_CAP } from '@plot/core/premium.js';
import { TrailerPlayer } from './TrailerPlayer';

// Shared link points at the web /save route (works for anyone, app or not) —
// mirrors web buildTitleShareUrl.
const SHARE_BASE = 'https://app.theplot.tv';
const buildShareUrl = (tmdbId: number, mediaType: string) =>
  `${SHARE_BASE}/save?media_type=${mediaType}&tmdb_id=${tmdbId}&src=share`;

const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;
const PANEL_H  = SCREEN_H * 0.92;

// ── helpers ───────────────────────────────────────────────────────────
function localDateStr(offsetDays = 0): string {
  const d = new Date(); d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ── SVG icons ─────────────────────────────────────────────────────────
function IconX() {
  // Fixed ink — sits on the light close pill over the backdrop image in both themes
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#09090B" strokeWidth={2.5} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} /><Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}
function IconHeart({ filled }: { filled: boolean }) {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={filled ? colors.accent : 'none'} stroke={filled ? colors.accent : colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}
function IconCheck({ color }: { color?: string }) {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color ?? colors.textSecondary} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}
function IconPlay() {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.8} strokeLinejoin="round">
      <Polygon points="5,3 19,12 5,21" />
    </Svg>
  );
}
function IconPlayTrailer() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth={1} strokeLinejoin="round">
      <Polygon points="8,4 21,12 8,20" />
    </Svg>
  );
}
function IconStop() {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.8} strokeLinejoin="round">
      <Rect x={4} y={4} width={16} height={16} rx={2} />
    </Svg>
  );
}
function IconPlus() {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2.2} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} /><Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}
function IconChevron({ dir = 'down' }: { dir?: 'down' | 'up' }) {
  const { colors } = useTheme();
  const pts = dir === 'down' ? '6 9 12 15 18 9' : '6 15 12 9 18 15';
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points={pts} />
    </Svg>
  );
}
function IconCircleCheck({ filled }: { filled: boolean }) {
  const { colors } = useTheme();
  return filled ? (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={colors.chipEpisode} stroke={colors.chipEpisode} strokeWidth={1.5} />
      <Polyline points="9 12 11 14 15 10" stroke="#fff" strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ) : (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.border} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
    </Svg>
  );
}
function IconList({ active }: { active?: boolean }) {
  const { colors } = useTheme();
  const c = active ? colors.accent : colors.textSecondary;
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={8} y1={6} x2={21} y2={6} /><Line x1={8} y1={12} x2={21} y2={12} /><Line x1={8} y1={18} x2={21} y2={18} />
      <Line x1={3} y1={6} x2={3.01} y2={6} /><Line x1={3} y1={12} x2={3.01} y2={12} /><Line x1={3} y1={18} x2={3.01} y2={18} />
    </Svg>
  );
}
function IconShare() {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} /><Circle cx={6} cy={12} r={3} /><Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} /><Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

// ── Star rating ───────────────────────────────────────────────────────
const STAR_COUNT = 5;
function StarRow({ rating, onChange }: { rating: number; onChange: (r: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {Array.from({ length: STAR_COUNT }, (_, i) => i + 1).map(n => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(rating === n ? 0 : n)}
          hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          accessibilityLabel={rating === n ? 'Clear rating' : `Rate ${n} star${n > 1 ? 's' : ''}`}
          accessibilityRole="button"
        >
          <Svg width={24} height={24} viewBox="0 0 24 24">
            <Polygon
              points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"
              fill={n <= rating ? '#F59E0B' : 'none'}
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </Svg>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ── Episode guide ─────────────────────────────────────────────────────
function EpisodeGuide({ tvId, progress, details, watching }: { tvId: number; progress: any; details: any; watching: any }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const seasons = (details?.seasons || []).filter((s: any) => s.season_number > 0);
  const [selSeason, setSelSeason] = useState(progress?.current_season || 1);
  const [episodes,  setEpisodes]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [toggling,  setToggling]  = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    tmdb.getSeason(tvId, selSeason).then((data: any) => {
      setEpisodes(data?.episodes ?? []);
      setLoading(false);
    });
  }, [tvId, selSeason]);

  const curSeason = progress?.current_season || 0;
  const curEp     = progress?.current_episode || 0;
  const isWatched = (ep: any) => selSeason < curSeason || (selSeason === curSeason && ep.episode_number < curEp);
  const isCurrent = (ep: any) => selSeason === curSeason && ep.episode_number === curEp;

  const handleToggle = async (ep: any) => {
    if (!progress || toggling !== null) return;
    setToggling(ep.episode_number);
    const watched = isWatched(ep);
    if (!watched) {
      if (ep.episode_number < episodes.length) {
        await watching.setProgress(tvId, selSeason, ep.episode_number + 1);
      } else {
        await watching.setProgress(tvId, selSeason + 1, 1);
      }
    } else {
      await watching.setProgress(tvId, selSeason, ep.episode_number);
    }
    setToggling(null);
  };

  return (
    <View>
      {/* Season selector */}
      {seasons.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}
        >
          {seasons.map((s: any) => (
            <TouchableOpacity
              key={s.season_number}
              style={[styles.seasonBtn, selSeason === s.season_number && styles.seasonBtnActive]}
              onPress={() => setSelSeason(s.season_number)}
            >
              <Text style={[styles.seasonBtnText, selSeason === s.season_number && styles.seasonBtnTextActive]}>
                S{String(s.season_number).padStart(2, '0')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
      ) : (
        episodes.map(ep => {
          const watched = isWatched(ep);
          const current = isCurrent(ep);
          const isToggling = toggling === ep.episode_number;
          const epCode = `S${String(selSeason).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`;
          return (
            <View key={ep.id} style={[styles.epRow, current && styles.epRowCurrent]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 }}>
                  <Text style={[styles.epCode, current && styles.epCodeCurrent]}>{epCode}</Text>
                  {ep.air_date && <Text style={styles.epAirDate}>{ep.air_date}</Text>}
                  {current && (
                    <View style={styles.upNextPill}>
                      <Text style={styles.upNextText}>UP NEXT</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.epTitle, watched && styles.epTitleWatched, current && styles.epTitleCurrent]} numberOfLines={2}>{ep.name}</Text>
              </View>
              {progress && (
                isToggling ? (
                  <ActivityIndicator size="small" color={colors.chipEpisode} />
                ) : (
                  <TouchableOpacity
                    onPress={() => handleToggle(ep)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel={watched ? `Mark ${epCode} unwatched` : `Mark ${epCode} watched`}
                    accessibilityRole="button"
                  >
                    <IconCircleCheck filled={watched} />
                  </TouchableOpacity>
                )
              )}
            </View>
          );
        })
      )}
    </View>
  );
}

// ── TMDB detail shapes ────────────────────────────────────────────────
interface TMDBNextEpisode {
  air_date?: string;
  name?: string;
  episode_number?: number;
  season_number?: number;
}

interface TMDBSeason {
  season_number: number;
  name: string;
}

interface TMDBGenre {
  id: number;
  name: string;
}

interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  release_date?: string;
  first_air_date?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genres?: TMDBGenre[];
  number_of_seasons?: number;
  seasons?: TMDBSeason[];
  next_episode_to_air?: TMDBNextEpisode | null;
  status?: string;
  videos?: { results: Array<{ site: string; type: string; key: string; name?: string }> };
  external_ids?: { imdb_id?: string | null };
}

// ── Main panel ────────────────────────────────────────────────────────
// ── Add-to-custom-list sheet (mobile port of web AddToCustomListSheet) ──
function AddToListSheet({ item, customLists, topLists, onClose }: {
  item: { id: number; media_type: string; title: string; poster_path: string | null };
  customLists: any;
  topLists: any;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { lists, isInList, addItem, removeItem, createList } = customLists;
  const { profile } = useAppData();
  const [creating, setCreating] = useState(false);
  const [name, setName]         = useState('');
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState(false);
  const [topOpen, setTopOpen]   = useState(false);
  const [moveToPicker, setMoveToPicker] = useState<{ rank: number; occupant: any } | null>(null);

  const topListType = item.media_type === 'tv' ? 'tv' : 'movies';
  const topItems     = topLists?.lists?.[topListType] || [];
  const currentRank   = topItems.find((t: any) => t.tmdb_id === item.id)?.rank;

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (findDuplicateCustomList(lists, trimmed)) { setError('A list with that name already exists.'); return; }
    if (!canCreateCustomList(lists.length, profile)) {
      setError(`Free accounts can have ${FREE_CUSTOM_LIST_CAP} lists. PLOT Premium gets unlimited.`);
      return;
    }
    setBusy(true);
    const newList = await createList(trimmed);
    if (!newList) { setBusy(false); setError('Could not create the list. Please try again.'); return; }
    await addItem(newList.id, item);   // create + immediately add this title, like web
    setBusy(false); setCreating(false); setName(''); setError('');
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.lsOverlay} onPress={onClose} activeOpacity={1} />
      <View style={[styles.lsSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.lsHandle} />
        <Text style={styles.lsTitle}>Add to list</Text>

        {!!topLists && (
          <View style={styles.lsTopSection}>
            <TouchableOpacity style={styles.lsRow} onPress={() => setTopOpen(o => !o)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lsName}>Top 10 {topListType === 'tv' ? 'TV Shows' : 'Movies'}</Text>
                <Text style={styles.lsCount}>{currentRank ? `Currently #${currentRank}` : 'Not ranked'}</Text>
              </View>
              <View style={[styles.lsCheck, currentRank && styles.lsCheckOn]}>
                {currentRank ? <Text style={styles.lsTopCheckNum}>{currentRank}</Text> : null}
              </View>
            </TouchableOpacity>
            {topOpen && (
              <View style={styles.lsTopGrid}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map(rank => {
                  const occupant = topItems.find((t: any) => t.rank === rank);
                  const isThis = occupant?.tmdb_id === item.id;
                  return (
                    <TouchableOpacity
                      key={rank}
                      style={[styles.lsTopSlot, isThis && styles.lsTopSlotOn]}
                      activeOpacity={0.7}
                      onPress={() => {
                        if (isThis) { topLists.removeSlot(topListType, item.id); return; }
                        if (occupant) {
                          Alert.alert(
                            `Replace #${rank}?`,
                            `"${occupant.title}" is currently #${rank}. Replace it with "${item.title}"?`,
                            [
                              { text: 'Cancel', style: 'cancel' },
                              { text: 'Move to...', onPress: () => setMoveToPicker({ rank, occupant }) },
                              { text: 'Replace', style: 'destructive', onPress: () => topLists.setSlot(topListType, rank, item) },
                            ]
                          );
                          return;
                        }
                        topLists.setSlot(topListType, rank, item);
                      }}
                    >
                      <Text style={[styles.lsTopSlotNum, isThis && styles.lsTopSlotNumOn]}>{rank}</Text>
                      {occupant && !isThis && (
                        <Text style={styles.lsTopSlotTitle} numberOfLines={1}>{occupant.title}</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        <ScrollView style={{ maxHeight: SCREEN_H * 0.45 }} keyboardShouldPersistTaps="handled">
          {lists.length === 0 && !creating && (
            <Text style={styles.lsEmpty}>No lists yet — create one below.</Text>
          )}
          {lists.map((list: any) => {
            const checked = isInList(list.id, item.id);
            return (
              <TouchableOpacity
                key={list.id}
                style={styles.lsRow}
                onPress={() => checked ? removeItem(list.id, item.id) : addItem(list.id, item)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.lsName} numberOfLines={1}>{list.name}</Text>
                  <Text style={styles.lsCount}>{(list.items || []).length} items</Text>
                </View>
                <View style={[styles.lsCheck, checked && styles.lsCheckOn]}>
                  {checked && <IconCheck color="#fff" />}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {creating ? (
          <View style={styles.lsCreateRow}>
            <TextInput
              style={styles.lsInput}
              placeholder="List name"
              placeholderTextColor={colors.textMuted}
              value={name}
              onChangeText={(t) => { setName(t); setError(''); }}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <TouchableOpacity style={styles.lsCreateBtn} onPress={handleCreate} disabled={busy} activeOpacity={0.8}>
              <Text style={styles.lsCreateBtnText}>{busy ? '…' : 'Create'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.lsNewBtn} onPress={() => setCreating(true)} activeOpacity={0.7}>
            <IconPlus />
            <Text style={styles.lsNewBtnText}>Create new list</Text>
          </TouchableOpacity>
        )}
        {error ? <Text style={styles.lsError}>{error}</Text> : null}
      </View>

      {moveToPicker && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setMoveToPicker(null)}>
          <TouchableOpacity style={styles.lsOverlay} onPress={() => setMoveToPicker(null)} activeOpacity={1} />
          <View style={[styles.lsSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.lsHandle} />
            <Text style={styles.lsTitle}>Move "{moveToPicker.occupant.title}" to...</Text>
            <View style={styles.lsTopGrid}>
              {Array.from({ length: 10 }, (_, i) => i + 1)
                .filter(r => r !== moveToPicker.rank && !topItems.find((t: any) => t.rank === r))
                .map(r => (
                  <TouchableOpacity
                    key={r}
                    style={styles.lsTopSlot}
                    activeOpacity={0.7}
                    onPress={async () => {
                      await topLists.setSlot(topListType, r, moveToPicker.occupant);
                      await topLists.setSlot(topListType, moveToPicker.rank, item);
                      setMoveToPicker(null);
                    }}
                  >
                    <Text style={styles.lsTopSlotNum}>{r}</Text>
                  </TouchableOpacity>
                ))}
            </View>
            {Array.from({ length: 10 }, (_, i) => i + 1).filter(r => r !== moveToPicker.rank && !topItems.find((t: any) => t.rank === r)).length === 0 && (
              <Text style={styles.lsEmpty}>No open spots — every other rank is taken.</Text>
            )}
          </View>
        </Modal>
      )}
    </Modal>
  );
}

interface MediaPanelProps {
  itemId: number;
  itemType: 'movie' | 'tv';
  onClose: () => void;
}

export default function MediaPanel({ itemId, itemType, onClose }: MediaPanelProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { userId, profile, watchlist, watching, favorites, history, customLists, topLists } = useAppData();
  const fw = favoriteWords(profile?.region);

  const [showListSheet, setShowListSheet] = useState(false);
  const [details,   setDetails]   = useState<TMDBDetails | null>(null);
  const [whereToWatch, setWhereToWatch] = useState<{ streaming: any[]; rentBuy: any[]; inCinemas: boolean; region: string; justwatchLink: string | null }>({ streaming: [], rentBuy: [], inCinemas: false, region: 'US', justwatchLink: null });
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(false);
  const [criticScore,   setCriticScore]   = useState<{ criticScore: number; source: string } | null>(null);
  const [audienceQuote, setAudienceQuote] = useState<{ text: string; author: string } | null>(null);
  const [retryKey,  setRetryKey]  = useState(0);
  const [trailerPlaying, setTrailerPlaying] = useState(false);

  const [localRating, setLocalRating] = useState(0);
  const [localReview, setLocalReview] = useState('');
  const [localDnf,    setLocalDnf]    = useState(false);
  const [savingReview, setSavingReview] = useState(false);

  const slideY = useRef(new Animated.Value(PANEL_H)).current;

  const isMovie    = itemType === 'movie';
  const inList     = watchlist.isInList(itemId);
  const isWatching = !isMovie && watching.isWatching(itemId);
  const progress   = watching.getProgress(itemId);
  const watched    = history.isWatched(itemId);
  const isFav      = favorites.isFavorite(itemId);
  const isInAnyList = customLists.lists.some((l: any) => customLists.isInList(l.id, itemId));
  const watchedEntry = history.entries?.find((e: any) => e.tmdb_id === Number(itemId));

  const handleShare = async () => {
    try {
      const t = details?.title || details?.name || '';
      const url = buildShareUrl(itemId, itemType);
      await Share.share({ message: t ? `${t}. ${url}` : url, url });
    } catch { /* user dismissed the share sheet */ }
  };

  // Sync review state
  useEffect(() => {
    if (watchedEntry) {
      setLocalRating(watchedEntry.rating || 0);
      setLocalReview(watchedEntry.note   || '');
      setLocalDnf(watchedEntry.dnf       || false);
    }
  }, [watchedEntry?.id]);

  // Slide in on mount
  useEffect(() => {
    Animated.spring(slideY, { toValue: 0, useNativeDriver: true, damping: 24, stiffness: 200 }).start();
  }, []);

  const close = () => {
    Animated.timing(slideY, { toValue: PANEL_H, duration: 260, useNativeDriver: true }).start(onClose);
  };

  // Load details
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(false); setTrailerPlaying(false);
      setCriticScore(null); setAudienceQuote(null);
      const region = getTmdbRegion();
      const [det, prov, verified] = await Promise.all([
        isMovie ? tmdb.getMovieDetails(itemId) : tmdb.getTVDetails(itemId),
        tmdb.getWatchProviders(itemId, itemType),
        fetchVerifiedAvailability({ tmdbId: itemId, mediaType: itemType, region }),
      ]);
      if (cancelled) return;
      if (!det) { setError(true); } else {
        setDetails(det);
        const regionData = prov?.results?.[region] || {};
        const fallbackOffers = offersFromTmdb(regionData).map((offer) => ({
          provider_id: offer.providerId,
          provider_name: offer.providerName,
          logo_path: offer.logoPath,
          offerType: offer.offerType,
          providerUrl: offer.providerUrl,
        }));
        const offerTypeLabels: Record<string, string> = { flatrate: 'Subscription', rent: 'Rent', buy: 'Buy', free: 'Free', ads: 'Free with ads' };
        const offers = verified?.offers?.length ? verified.offers.map((offer: any) => ({
          provider_id: offer.providerId,
          provider_name: offer.providerName,
          logo_path: offer.logoPath,
          offerType: offerTypeLabels[offer.offerType] || offer.offerType,
          providerUrl: offer.providerUrl,
        })) : fallbackOffers;
        const dedupe = (list: any[]) => {
          const seen = new Set<number>();
          return list.filter((p: any) => (seen.has(p.provider_id) ? false : (seen.add(p.provider_id), true)));
        };
        const streaming = dedupe(offers.filter((offer: any) => ['Subscription', 'Free', 'Free with ads'].includes(offer.offerType)));
        const rentBuy = dedupe(offers.filter((offer: any) => ['Rent', 'Buy'].includes(offer.offerType)));
        // Cinema: a movie released in the last 90 days with no digital availability yet.
        let inCinemas = false;
        if (isMovie && det.release_date) {
          const days = (Date.now() - new Date(det.release_date).getTime()) / 86400000;
          inCinemas = det.status === 'Released' && days >= 0 && days <= 90 && streaming.length === 0 && rentBuy.length === 0;
        }
        setWhereToWatch({ streaming, rentBuy, inCinemas, region, justwatchLink: verified?.title_url || regionData.link || null });
        // Critic score + audience quote depend on the imdb_id this same call just
        // returned, so they can't join the Promise.all above. Fire-and-forget
        // rather than block the panel on a third-party lookup.
        const imdbId = det.external_ids?.imdb_id;
        if (imdbId) fetchCriticScore(imdbId).then((r) => { if (!cancelled) setCriticScore(r); });
        tmdb.getReviews(itemType, itemId).then((reviews: any) => { if (!cancelled) setAudienceQuote(pickAudienceQuote(reviews)); });
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [itemId, itemType, retryKey]);

  const title = details?.title || details?.name || '';

  // Outbound watch link: verified provider offer where available, with the
  // region-specific JustWatch title page as the safe fallback.
  const openWatchLink = (p: any) => {
    const link = buildWatchLink({
      providerUrl: p.providerUrl,
      justwatchLink: whereToWatch.justwatchLink,
    });
    if (link?.url) {
      Linking.openURL(link.url).catch((e) => {
        console.warn('[MediaPanel] failed to open watch link', e);
        Alert.alert("Couldn't open link", 'Please try again in a moment.');
      });
    }
  };
  const year   = (details?.release_date || details?.first_air_date || '').slice(0, 4);
  const rating = details?.vote_average ? `${details.vote_average.toFixed(1)} ★` : '';
  const genres = (details?.genres || []).slice(0, 3).map((g: any) => g.name).join(' · ');
  const audienceScore = Number.isFinite(details?.vote_average) ? Math.round((details!.vote_average as number) * 10) : null;
  const consensusLine = criticScore
    ? getConsensusLine(criticScore.criticScore, audienceScore, { audienceVoteCount: details?.vote_count, seed: details?.id })
    : null;

  // Prefer an official Trailer, then Teaser, then any YouTube clip (mirrors web).
  const vids = details?.videos?.results || [];
  const trailer = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || vids.find(v => v.site === 'YouTube' && v.type === 'Teaser')
    || vids.find(v => v.site === 'YouTube');
  const trailerKey = trailer?.key || null;

  const hasSavedReview = !!(watchedEntry?.rating || watchedEntry?.note?.trim() || watchedEntry?.dnf);
  const reviewDirty    = !!watchedEntry && (localRating !== (watchedEntry.rating || 0) || localReview.trim() !== (watchedEntry.note || '').trim() || localDnf !== !!watchedEntry.dnf);

  return (
    <>
    <Modal visible transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* Backdrop */}
      <TouchableOpacity style={styles.overlay} onPress={close} activeOpacity={1} />

      <Animated.View style={[styles.panel, { transform: [{ translateY: slideY }], paddingBottom: insets.bottom }]}>
        {/* Drag handle — floats over the backdrop so the image is flush to the top */}
        <View style={styles.handleOverlay} pointerEvents="none">
          <View style={styles.handle} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
          {/* Backdrop image */}
          <View style={styles.backdropWrap}>
            {details?.backdrop_path
              ? <Image source={{ uri: backdropUrl(details.backdrop_path) ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : details?.poster_path
              ? <Image source={{ uri: posterUrl(details.poster_path, 'w780') ?? '' }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />
            }
            <View style={styles.backdropGradient} />
            <TouchableOpacity style={styles.closeBtn} onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close" accessibilityRole="button">
              <IconX />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            {loading ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : error ? (
              <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
                <Text style={styles.errorText}>Couldn't load details. Check your connection.</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => setRetryKey(k => k + 1)}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                {/* Title */}
                <Text style={styles.title}>{title}</Text>

                {/* Meta row */}
                <View style={styles.metaRow}>
                  {year ? <Text style={styles.metaYear}>{year}</Text> : null}
                  <Text style={styles.metaType}>
                    {isMovie ? 'Movie' : `Series${details?.number_of_seasons ? ` · ${details.number_of_seasons} season${details.number_of_seasons > 1 ? 's' : ''}` : ''}`}
                  </Text>
                  {rating ? <Text style={styles.metaRating}>{rating}</Text> : null}
                </View>

                {genres ? <Text style={styles.genres}>{genres}</Text> : null}

                {/* Critic / audience scores */}
                {(criticScore || Number.isFinite(audienceScore)) && (
                  <Text style={styles.scoresRow}>
                    {criticScore && <Text style={styles.scoreCritics}>{criticScore.criticScore}% Critics</Text>}
                    {criticScore && Number.isFinite(audienceScore) && <Text style={styles.scoreDivider}> · </Text>}
                    {Number.isFinite(audienceScore) && <Text style={styles.scoreAudience}>{audienceScore}% Audience</Text>}
                  </Text>
                )}
                {consensusLine ? <Text style={styles.consensusLine}>{consensusLine}</Text> : null}

                {/* Overview */}
                {details?.overview ? <Text style={styles.overview}>{details.overview}</Text> : null}

                {audienceQuote && (
                  <View style={styles.audienceQuote}>
                    <Text style={styles.audienceQuoteText}>&ldquo;{audienceQuote.text}&rdquo;</Text>
                    <Text style={styles.audienceQuoteAttr}>
                      {audienceQuote.author || 'A TMDB audience review'}
                    </Text>
                  </View>
                )}

                {/* Trailer — plays inline, inside the app */}
                {trailerKey && (
                  trailerPlaying ? (
                    <View style={styles.trailerPlayer}>
                      <TrailerPlayer videoKey={trailerKey} />
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.trailerCard}
                      activeOpacity={0.85}
                      onPress={() => setTrailerPlaying(true)}
                    >
                      {backdropUrl(details?.backdrop_path, 'w780')
                        ? <Image source={{ uri: backdropUrl(details?.backdrop_path, 'w780')! }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                        : <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.surfaceSunken }]} />}
                      <View style={styles.trailerScrim} />
                      <View style={styles.trailerPlayBtn}><IconPlayTrailer /></View>
                      <Text style={styles.trailerLabel}>Play trailer</Text>
                    </TouchableOpacity>
                  )
                )}

                {/* ── Action buttons ── */}
                <View style={styles.actionsCol}>
                  {/* Save */}
                  {!isWatching && (
                    <TouchableOpacity
                      style={[styles.btnPrimary, inList && styles.btnSaved]}
                      onPress={() => watchlist.toggle({ ...details, id: itemId, media_type: itemType })}
                    >
                      {inList && <IconCheck color="#4ade80" />}
                      <Text style={[styles.btnPrimaryText, inList && { color: '#4ade80' }]}>
                        {inList ? 'Saved' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* Secondary row */}
                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={[styles.btnSecondary, isFav && styles.btnSecondaryActive]}
                      onPress={() => favorites.toggleFavorite({ ...details, id: itemId, media_type: itemType })}
                    >
                      <IconHeart filled={isFav} />
                      <Text style={[styles.btnSecondaryText, isFav && { color: colors.accent }]}>
                        {isFav ? fw.pastTitle : fw.noun}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btnSecondary, isInAnyList && styles.btnSecondaryActive]}
                      onPress={() => setShowListSheet(true)}
                    >
                      <IconList active={isInAnyList} />
                      <Text style={[styles.btnSecondaryText, isInAnyList && { color: colors.accent }]}>
                        {isInAnyList ? 'On list' : 'List'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnSecondary} onPress={handleShare}>
                      <IconShare />
                      <Text style={styles.btnSecondaryText}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* ── Watching / watched ── */}
                {!watched ? (
                  <View style={styles.actionsRow}>
                    {!isMovie && (
                      <TouchableOpacity
                        style={[styles.btnSecondary, isWatching && styles.btnWatching]}
                        onPress={async () => {
                          if (isWatching) {
                            await watching.stopWatching(itemId);
                          } else {
                            await watching.startWatching({ ...details, id: itemId, media_type: 'tv' });
                            if (inList) await watchlist.toggle({ ...details, id: itemId, media_type: itemType });
                          }
                        }}
                      >
                        {isWatching ? <IconStop /> : <IconPlay />}
                        <Text style={[styles.btnSecondaryText, isWatching && { color: '#818cf8' }]}>
                          {isWatching ? 'Stop watching' : 'Start watching'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={styles.btnSecondary}
                      onPress={async () => {
                        await history.logWatched({ ...details, id: itemId, media_type: itemType }, { logRewatches: profile?.log_rewatches ?? true });
                        if (!isMovie && isWatching) await watching.stopWatching(itemId);
                      }}
                    >
                      <IconCheck />
                      <Text style={styles.btnSecondaryText}>{isMovie ? 'Mark watched' : 'Mark all watched'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={{ marginBottom: spacing.lg }}>
                    <TouchableOpacity
                      style={[styles.btnPrimary, styles.btnSaved]}
                      onPress={() => history.removeEntry(itemId)}
                    >
                      <IconCheck color="#4ade80" />
                      <Text style={[styles.btnPrimaryText, { color: '#4ade80' }]}>Watched</Text>
                    </TouchableOpacity>

                    {/* Review section */}
                    <Text style={styles.sectionTitle}>Your Review</Text>
                    <View style={styles.reviewHeader}>
                      <StarRow rating={localRating} onChange={setLocalRating} />
                      <TouchableOpacity
                        style={[styles.dnfChip, localDnf && styles.dnfChipActive]}
                        onPress={() => setLocalDnf(d => !d)}
                      >
                        {localDnf && <IconCheck color="#fb923c" />}
                        <Text style={[styles.dnfText, localDnf && { color: '#fb923c' }]}>Didn't finish</Text>
                      </TouchableOpacity>
                    </View>
                    <TextInput
                      style={styles.reviewInput}
                      value={localReview}
                      onChangeText={t => { if (t.length <= 280) setLocalReview(t); }}
                      placeholder="Write a quick review…"
                      placeholderTextColor={colors.textMuted}
                      multiline
                      numberOfLines={3}
                      maxLength={280}
                    />
                    {(hasSavedReview || localRating > 0 || localReview.trim() || localDnf) && (
                      <TouchableOpacity
                        style={[styles.btnPrimary, { marginTop: spacing.sm }]}
                        disabled={savingReview}
                        onPress={async () => {
                          setSavingReview(true);
                          await history.updateEntry(itemId, { rating: localRating || null, note: localReview.trim() || null, dnf: localDnf });
                          setSavingReview(false);
                        }}
                      >
                        <Text style={styles.btnPrimaryText}>{savingReview ? 'Saving…' : reviewDirty ? 'Save changes' : hasSavedReview ? 'Edit review' : 'Save review'}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}

                {/* Where to watch */}
                {(whereToWatch.streaming.length > 0 || whereToWatch.rentBuy.length > 0 || whereToWatch.inCinemas) && (
                  <>
                    <Text style={styles.sectionTitle}>Where to Watch</Text>

                    {whereToWatch.inCinemas && (
                      <View style={[styles.providerChip, styles.providerChipCinema]}>
                        <Text style={[styles.providerName, { color: colors.accent, maxWidth: undefined }]}>In Cinemas</Text>
                      </View>
                    )}

                    {whereToWatch.streaming.length > 0 && (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
                        {whereToWatch.streaming.map((p: any) => (
                          <TouchableOpacity key={p.provider_id} style={styles.providerChip} activeOpacity={0.7} onPress={() => openWatchLink(p)}>
                            {p.logo_path && <Image source={{ uri: logoUrl(p.logo_path, 'w45') ?? '' }} style={styles.providerLogo} />}
                            <Text style={styles.providerName} numberOfLines={1}>{p.provider_name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}

                    {whereToWatch.rentBuy.length > 0 && (
                      <>
                        {whereToWatch.streaming.length > 0 && <Text style={styles.providerSublabel}>Rent or Buy</Text>}
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
                          {whereToWatch.rentBuy.map((p: any) => (
                            <TouchableOpacity key={p.provider_id} style={[styles.providerChip, styles.providerChipRentBuy]} activeOpacity={0.7} onPress={() => openWatchLink(p)}>
                              {p.logo_path && <Image source={{ uri: logoUrl(p.logo_path, 'w45') ?? '' }} style={styles.providerLogo} />}
                              <Text style={styles.providerName} numberOfLines={1}>{p.provider_name}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </>
                    )}

                    <Text style={styles.providersAttribution}>
                      Streaming availability by JustWatch.
                      {[...whereToWatch.streaming, ...whereToWatch.rentBuy].some((p: any) =>
                        buildWatchLink({ providerUrl: p.providerUrl, justwatchLink: whereToWatch.justwatchLink })?.kind === 'provider'
                      ) ? ' Links open the verified title offer.' : ''}
                    </Text>
                  </>
                )}

                {/* Episode guide */}
                {!isMovie && details && (
                  <>
                    <Text style={styles.sectionTitle}>Episodes</Text>
                    <EpisodeGuide tvId={itemId} progress={progress} details={details} watching={watching} />
                  </>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>

    {showListSheet && details && (
      <AddToListSheet
        item={{ id: itemId, media_type: itemType, title, poster_path: details?.poster_path ?? null }}
        customLists={customLists}
        topLists={topLists}
        onClose={() => setShowListSheet(false)}
      />
    )}
    </>
  );
}

// ── Styles ────────────────────────────────────────────────────────────
const makeStyles = (colors: Palette) => StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },

  panel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: PANEL_H,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.15, shadowRadius: 24, elevation: 24,
  },
  handleOverlay: { position: 'absolute', top: spacing.md, left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.7)' },

  backdropWrap: { height: 200, position: 'relative' },
  backdropGradient: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  closeBtn: {
    position: 'absolute', top: spacing.lg, right: spacing.lg,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },

  body: { padding: spacing.xl },

  title:    { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, marginBottom: spacing.sm },
  metaRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm, flexWrap: 'wrap' },
  metaYear: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  metaType: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  metaRating: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: '#F59E0B' },
  genres:   { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md },
  scoresRow: { fontSize: fontSize.md, marginBottom: 4 },
  scoreCritics: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  scoreAudience: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.accent },
  scoreDivider: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textMuted },
  consensusLine: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 17 },
  overview: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  audienceQuote: { borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: spacing.md, marginBottom: spacing.md },
  audienceQuoteText: { fontFamily: fontFamily.serif, fontStyle: 'italic', fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21 },
  audienceQuoteAttr: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.textMuted, marginTop: 4, letterSpacing: 0.3 },

  // Single-source spacing.sm rhythm for the action block: the col gap handles
  // Save↔row1 and its marginBottom handles row1↔watching-row. Rows carry no
  // margin of their own, so nothing can stack into an uneven gap. The section
  // below spaces itself (sectionTitle marginTop).
  actionsCol: { gap: spacing.sm, marginBottom: spacing.sm },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },

  btnPrimary: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  btnSaved:    { backgroundColor: '#0d2d1a', borderWidth: 1.5, borderColor: 'rgba(74,222,128,0.2)' },
  btnPrimaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: '#fff' },

  btnSecondary: {
    // 10.5 + 1.5 border = 12 per side, so secondary rows match btnPrimary's height exactly
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md,
    paddingVertical: 10.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  btnSecondaryActive: { borderColor: `${colors.accent}66`, backgroundColor: colors.accentDim },
  btnWatching:        { borderColor: 'rgba(99,102,241,0.45)', backgroundColor: 'rgba(99,102,241,0.12)' },
  btnSecondaryText:   { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },

  sectionTitle: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.md },

  reviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  dnfChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.pill, borderWidth: 1.5, borderColor: colors.border },
  dnfChipActive: { borderColor: 'rgba(251,146,60,0.5)', backgroundColor: 'rgba(251,146,60,0.12)' },
  dnfText: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.textMuted },
  reviewInput: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.md,
    padding: spacing.md, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary,
    minHeight: 72, textAlignVertical: 'top', backgroundColor: colors.surface,
  },

  providerChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  providerChipCinema: { alignSelf: 'flex-start', backgroundColor: colors.accentDim, borderColor: colors.accent + '66', marginBottom: spacing.md },
  providerChipRentBuy: { opacity: 0.8 },
  providerLogo: { width: 24, height: 24, borderRadius: 6 },
  providerName: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary, maxWidth: 90 },
  providersAttribution: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 15 },
  providerSublabel: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.sm },
  // Trailer card — 16:9 backdrop with a play affordance; opens YouTube on tap.
  trailerCard: { height: (SCREEN_W - spacing.xl * 2) * 9 / 16, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  trailerPlayer: { height: (SCREEN_W - spacing.xl * 2) * 9 / 16, borderRadius: radii.md, overflow: 'hidden', backgroundColor: '#000', marginTop: spacing.md, marginBottom: spacing.sm },
  trailerScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  trailerPlayBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  trailerLabel: { position: 'absolute', bottom: spacing.md, fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, letterSpacing: 0.5, textTransform: 'uppercase', color: '#fff' },

  epRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: spacing.sm, paddingRight: spacing.md, borderLeftWidth: 3, borderLeftColor: 'transparent', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md },
  epRowCurrent: { backgroundColor: colors.accentDim, borderLeftColor: colors.accent },
  epCode:        { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.chipEpisode, letterSpacing: 0.4 },
  epCodeCurrent: { color: colors.accent },
  epAirDate:   { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },
  upNextPill:  { backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  upNextText:  { fontFamily: fontFamily.sansBold, fontSize: 9, color: '#fff', letterSpacing: 0.6 },
  epTitle:     { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  epTitleCurrent: { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  epTitleWatched: { color: colors.textMuted },

  seasonBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  seasonBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  seasonBtnText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textMuted },
  seasonBtnTextActive: { color: colors.accent },

  errorText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  retryBtn:  { paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border },
  retryText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },

  // ── Add-to-list sheet ──
  lsOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  lsSheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.xl, paddingTop: spacing.sm,
  },
  lsHandle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: spacing.md },
  lsTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.md },
  lsEmpty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, paddingVertical: spacing.md },
  lsRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  lsName:  { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  lsCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  lsCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  lsCheckOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  lsTopCheckNum: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: '#fff' },
  lsTopSection: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, marginBottom: spacing.xs },
  lsTopGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingBottom: spacing.md },
  lsTopSlot: {
    width: '18%', aspectRatio: 1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceSunken,
    alignItems: 'center', justifyContent: 'center', padding: 4,
  },
  lsTopSlotOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  lsTopSlotNum: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textMuted },
  lsTopSlotNumOn: { color: '#fff' },
  lsTopSlotTitle: { fontFamily: fontFamily.sans, fontSize: 8, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
  lsNewBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md, marginTop: spacing.xs },
  lsNewBtnText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
  lsCreateRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  lsInput: {
    flex: 1, backgroundColor: colors.surfaceSunken, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  lsCreateBtn: { backgroundColor: colors.accent, borderRadius: radii.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  lsCreateBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: '#fff' },
  lsError: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.danger, marginTop: spacing.sm },
});
