/**
 * Home's first-run card after onboarding: the RN counterpart of
 * apps/web/src/components/FinishingTouches.jsx. Five steps, each ticking only
 * when the action is really done (titles saved, an episode or a watch logged,
 * someone followed, an import finished, an actor or director followed). The
 * rules, copy and stored state's shape live in @plot/core/finishingTouches.js
 * and copy/finishingTouches.js.
 *
 * Collapsed by default, same as web below 1024px. Hide stays in the header
 * either way: a phone that never expands the card can still dismiss it.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { followUser } from '@plot/core/useFollows.js';
import { usePeopleSuggestions } from '@plot/core/useHomeShelves.js';
import { deriveFinishingTouches, finishingTouchesVisible, firstWatchlistShow, type FinishingTouchesState, type WatchlistShow } from '@plot/core/finishingTouches.js';
import { pointerAfterEpisode } from '@plot/core/watchingProgress.js';
import { oncePerSession } from '@plot/core/oncePerSession.js';
import { availableImportSources } from '@plot/core/onboardingSetup.js';
import { getConfig } from '@plot/core/config.js';
import { IMPORT_ENTRY_POINTS, createImportReporter } from '@plot/core/importPipeline.js';
import { FINISHING_TOUCHES as T } from '@plot/core/copy/finishingTouches.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { COMMON } from '@plot/core/copy/common.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { supabase } from '../lib/supabase';
import { tmdb } from '../lib/tmdb';
import { track, EVENTS } from '../lib/analytics';
import { favoriteWords } from '../lib/spelling';
import {
  closeFinishingTouches, hideFinishingTouchesFor, markImportDone, readFinishingTouches,
} from '../lib/finishingTouches';
import { suppressFirstWinForImport } from '../lib/firstWinCard';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useFollows } from '../hooks/useFollows';
import ImportHistoryModal from './ImportHistoryModal';
import ImportSourceIcon from './ImportSourceIcon';
import { FollowPill, PersonFace } from './people/FollowControls';
import { useFollowPerson } from './people/useFollowPerson';

type Sheet = 'friends' | 'import' | 'people' | 'progress' | null;

/** Whether Home treats this account as first-run. `ready` flips once AsyncStorage has answered. */
export function useFinishingTouchesState(userId: string | null | undefined) {
  const [state, setState] = useState<FinishingTouchesState | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const reload = useCallback(() => {
    const id = userId;
    readFinishingTouches(id).then(next => {
      setState(next);
      setLoadedFor(id);
    });
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  return { state, setState, reload, ready: loadedFor === userId, visible: finishingTouchesVisible(state) };
}

function Tick({ done, size = 12 }: { done: boolean; size?: number }) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={done ? T.done : T.notDone}
      style={{
        width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
        borderWidth: 1.5, borderColor: done ? colors.accentFill : colors.borderStrong,
        backgroundColor: done ? colors.accentFill : 'transparent',
      }}
    >
      {done && (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={colors.onAccentFill} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M5 12l5 5L19 7" />
        </Svg>
      )}
    </View>
  );
}

export default function FinishingTouches({ state, onState }: {
  state: FinishingTouchesState | null;
  onState: (next: FinishingTouchesState | null) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { userId, profile, watchlist, watching, history } = useAppData();
  const follows = useFollows(userId, userId);
  const followPerson = useFollowPerson();
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const fav = favoriteWords(profile?.region);

  const savedCount = watchlist?.items?.length ?? 0;
  const show = firstWatchlistShow(watchlist?.items);
  const progressDone = (watching?.items?.length ?? 0) > 0
    || (history?.entries || []).some((entry: { media_type?: string }) => entry?.media_type === 'tv');
  const { steps, doneCount, total, allDone } = deriveFinishingTouches({
    savedCount,
    followingCount: follows.following,
    importDone: !!state?.importDone,
    peopleCount: followPerson.follows.length,
    progressDone,
    traktImportDone: !!state?.traktImportDone,
    showProgress: !!show,
  });
  const visible = !!userId && finishingTouchesVisible(state);

  useEffect(() => {
    if (!visible || watchlist?.loading) return;
    oncePerSession('finishing_touches_viewed', () => {
      track(EVENTS.FINISHING_TOUCHES_VIEWED, { done_count: doneCount, total });
    });
  }, [visible, watchlist?.loading, doneCount, total]);

  if (!visible) return null;

  const first = followPerson.follows[0]?.name;
  const tiles = steps.map(step => {
    if (step.id === 'watchlist') return { ...step, title: T.steps.watchlist.title, sub: T.steps.watchlist.sub(savedCount), cta: undefined };
    if (step.id === 'progress') {
      const sub = step.done
        ? (state?.traktImportDone && !progressDone ? T.steps.progress.traktDoneSub : T.steps.progress.doneSub)
        : T.steps.progress.sub(show?.title || '');
      return { ...step, title: T.steps.progress.title, sub, cta: T.steps.progress.cta };
    }
    if (step.id === 'friends') {
      return { ...step, title: T.steps.friends.title, sub: step.done ? T.steps.friends.doneSub(follows.following) : T.steps.friends.sub, cta: T.steps.friends.cta };
    }
    if (step.id === 'import') {
      return { ...step, title: T.steps.import.title, sub: step.done ? T.steps.import.doneSub : T.steps.import.sub, cta: T.steps.import.cta };
    }
    return {
      ...step,
      title: T.steps.people.title(fav.pluralLower),
      sub: step.done && first ? T.steps.people.doneSub(first, followPerson.follows.length - 1) : T.steps.people.sub,
      cta: T.steps.people.cta,
    };
  });

  const closeSheet = () => {
    setSheet(null);
    follows.refresh();
  };

  if (allDone) {
    return (
      <View style={styles.ready} accessibilityLiveRegion="polite">
        <View style={styles.readyMark}>
          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.onAccentFill} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M5 12l5 5L19 7" />
          </Svg>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.readyTitle}>{T.ready}</Text>
          <Text style={styles.readyBody}>{T.readyBody}</Text>
        </View>
        <TouchableOpacity
          style={styles.pill}
          onPress={async () => onState(await closeFinishingTouches(userId))}
          accessibilityRole="button"
        >
          <Text style={styles.pillText}>{T.nice}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel={T.title}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">{T.title}</Text>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={async () => {
            track(EVENTS.FINISHING_TOUCHES_HIDDEN, { done_count: doneCount });
            onState(await hideFinishingTouchesFor(userId));
          }}
          accessibilityRole="button"
          hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
        >
          <Text style={styles.hide}>{T.hide}</Text>
        </TouchableOpacity>
        <Text style={styles.count}>{T.count(doneCount, total)}</Text>
        <TouchableOpacity
          onPress={() => setExpanded(open => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? T.collapse : T.expand}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: [{ rotate: expanded ? '180deg' : '0deg' }] }}>
            <Path d="M6 9l6 6 6-6" />
          </Svg>
        </TouchableOpacity>
        <View style={styles.barFull} accessibilityRole="image" accessibilityLabel={T.progressLabel(doneCount, total)}>
          {tiles.map((tile, i) => <View key={tile.id} style={[styles.barSeg, i < doneCount && styles.barSegOn]} />)}
        </View>
      </View>

      {expanded && (
        <View style={styles.tiles}>
          {tiles.map(tile => (
            <View key={tile.id} style={[styles.tile, tile.done && styles.tileDone]}>
              <View style={styles.tileHead}>
                <Tick done={tile.done} />
                <Text style={styles.tileTitle}>{tile.title}</Text>
              </View>
              <Text style={styles.tileSub}>{tile.sub}</Text>
              {!tile.done && tile.cta && (
                <TouchableOpacity
                  style={styles.tileCta}
                  onPress={() => {
                    track(EVENTS.FINISHING_TOUCH_OPENED, { step: tile.id });
                    setSheet(tile.id as Sheet);
                  }}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.tileCtaText}>{tile.cta} →</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {sheet === 'progress' && show && (
        <UpToSheet show={show} watching={watching} onClose={closeSheet} />
      )}
      {sheet === 'friends' && <FriendsSheet userId={userId} onClose={closeSheet} />}
      {sheet === 'people' && <PeopleSheet watchlistItems={watchlist?.items ?? []} favourites={fav.pluralLower} follow={followPerson} onClose={closeSheet} />}
      {sheet === 'import' && !!userId && (
        <ImportSourceSheet
          userId={userId}
          onImported={async (source, count) => {
            onState(await markImportDone(userId, source, count));
            await suppressFirstWinForImport(userId, source);
          }}
          onClose={closeSheet}
        />
      )}
      {followPerson.sheet}
    </View>
  );
}

/* ── Shared bottom sheet ── */
function BottomSheet({ title, sub, onClose, children }: { title: string; sub: string; onClose: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.layer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={T.close} />
        <View style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} accessibilityViewIsModal>
          <View style={styles.grab} />
          <ScrollView contentContainerStyle={styles.sheetContent} bounces={false} showsVerticalScrollIndicator={false}>
            <Text style={styles.sheetTitle} accessibilityRole="header">{title}</Text>
            <Text style={styles.sheetSub}>{sub}</Text>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/* ── Find your people: suggested public profiles, followed in place ── */
interface SuggestedUser { id: string; username: string; display_name: string | null; avatar_url: string | null }

function FriendsSheet({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [rows, setRows] = useState<SuggestedUser[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [status, setStatus] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    let alive = true;
    supabase.rpc('suggested_users', { p_limit: 6 }).then(({ data, error }: { data: SuggestedUser[] | null; error: unknown }) => {
      if (!alive) return;
      if (error) { setFailed(true); setRows([]); return; }
      setRows(data || []);
    });
    return () => { alive = false; };
  }, []);

  const follow = async (row: SuggestedUser) => {
    setStatus(s => ({ ...s, [row.id]: 'busy' }));
    const result = await followUser({ viewerId: userId, targetId: row.id });
    setStatus(s => ({ ...s, [row.id]: result.ok ? (result.status || 'accepted') : undefined }));
  };

  return (
    <BottomSheet title={T.friendsSheet.title} sub={T.friendsSheet.sub} onClose={onClose}>
      {rows === null ? null : rows.length === 0 ? (
        <Text style={styles.empty}>{failed ? T.friendsSheet.loadError : T.friendsSheet.empty}</Text>
      ) : rows.map(row => {
        const name = row.display_name || row.username;
        const s = status[row.id];
        return (
          <View key={row.id} style={styles.personRow}>
            {row.avatar_url
              ? <Image source={{ uri: row.avatar_url }} style={styles.avatar} />
              : <View style={[styles.avatar, styles.avatarFallback]}><Text style={styles.avatarInitial}>{name.charAt(0).toUpperCase()}</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={styles.personName} numberOfLines={1}>{name}</Text>
              {!!row.display_name && <Text style={styles.personSub} numberOfLines={1}>@{row.username}</Text>}
            </View>
            <TouchableOpacity
              style={[styles.pill, !!s && s !== 'busy' && styles.pillOn, !!s && { opacity: s === 'busy' ? 0.5 : 1 }]}
              disabled={!!s}
              onPress={() => follow(row)}
              accessibilityRole="button"
            >
              <Text style={styles.pillText}>
                {s === 'pending' ? T.friendsSheet.requested : s === 'accepted' ? T.friendsSheet.following : T.friendsSheet.follow}
              </Text>
            </TouchableOpacity>
          </View>
        );
      })}
      <TouchableOpacity onPress={() => { onClose(); router.push('/(app)/search' as Href); }} accessibilityRole="link" style={styles.sheetLink}>
        <Text style={styles.sheetLinkText}>{T.friendsSheet.search}</Text>
      </TouchableOpacity>
    </BottomSheet>
  );
}

/* ── Bring your history over: pick a source, then the import opens on it ── */
function ImportSourceSheet({ userId, onImported, onClose }: { userId: string; onImported: (source: string, importedCount: number) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [source, setSource] = useState<string | null>(null);

  if (source) {
    return (
      <ImportHistoryModal
        userId={userId}
        entry={IMPORT_ENTRY_POINTS.FINISHING_TOUCHES}
        initialPlatform={source as never}
        onImported={onImported}
        onClose={onClose}
      />
    );
  }
  return (
    <BottomSheet title={T.importSheet.title} sub={T.importSheet.sub} onClose={onClose}>
      {availableImportSources(getConfig()).map(src => (
        <TouchableOpacity
          key={src.id}
          style={styles.source}
          onPress={() => {
            createImportReporter({ entry: IMPORT_ENTRY_POINTS.FINISHING_TOUCHES }).selected(src.id);
            setSource(src.id);
          }}
          accessibilityRole="button"
        >
          <ImportSourceIcon id={src.id} name={src.name} />
          <View style={{ flex: 1 }}>
            <Text style={styles.personName}>{src.name}</Text>
            <Text style={styles.personSub}>{src.hint}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

/* ── Follow your favourites: people behind the watchlist ── */
const fetchDetails = (type: 'movie' | 'tv', id: number) => (type === 'tv' ? tmdb.getTVDetails(id) : tmdb.getMovieDetails(id));

function PeopleSheet({ watchlistItems, favourites, follow, onClose }: {
  watchlistItems: Array<{ tmdb_id: number; media_type: string }>;
  favourites: string;
  follow: ReturnType<typeof useFollowPerson>;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const titles = useMemo(() => watchlistItems.map(i => ({ tmdb_id: i.tmdb_id, media_type: i.media_type })), [watchlistItems]);
  const { suggestions, loading } = usePeopleSuggestions(titles, fetchDetails, { enabled: titles.length > 0, exclude: undefined });
  const reason = (s: { kind: string; count: number; title: string }) => (s.kind === 'directed'
    ? (s.count > 1 ? PEOPLE.shelf.directed(s.count) : PEOPLE.shelf.directedOne(s.title))
    : (s.count > 1 ? PEOPLE.shelf.actedIn(s.count) : PEOPLE.shelf.actedInOne(s.title)));

  return (
    <BottomSheet title={T.peopleSheet.title(favourites)} sub={T.peopleSheet.sub} onClose={onClose}>
      <Text style={styles.sheetH}>{T.peopleSheet.fromWatchlist}</Text>
      {!loading && suggestions.length === 0 ? (
        <Text style={styles.empty}>{T.peopleSheet.empty}</Text>
      ) : suggestions.map((s: { id: number; name: string; profilePath?: string | null; kind: string; count: number; title: string }) => (
        <View key={s.id} style={styles.personRow}>
          <PersonFace name={s.name} path={s.profilePath} size={40} />
          <View style={{ flex: 1 }}>
            <Text style={styles.personName} numberOfLines={1}>{s.name}</Text>
            <Text style={styles.personSub} numberOfLines={1}>{reason(s)}</Text>
          </View>
          <FollowPill
            following={follow.isFollowing(s.id)}
            busy={follow.busyId === s.id}
            name={s.name}
            onPress={() => follow.toggle({ id: s.id, name: s.name, profile_path: s.profilePath, known_for_department: s.kind === 'directed' ? 'Directing' : 'Acting' })}
          />
        </View>
      ))}
    </BottomSheet>
  );
}

function UpToSheet({ show, watching, onClose }: {
  show: WatchlistShow;
  watching: ReturnType<typeof useAppData>['watching'];
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const pick = show;
  const [details, setDetails] = useState<{ name?: string; poster_path?: string | null; seasons?: Array<{ season_number: number }> } | null>(null);
  const [failed, setFailed] = useState(false);
  const [selSeason, setSelSeason] = useState(1);
  const [seasonLoad, setSeasonLoad] = useState<{ season: number; episodes: Array<{ episode_number: number; name?: string }> | null; failed: boolean }>({ season: 0, episodes: null, failed: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    tmdb.getTVDetails(pick.id).then((data: { name?: string; poster_path?: string | null; seasons?: Array<{ season_number: number }> } | null) => {
      if (!alive) return;
      if (!data) { setFailed(true); return; }
      setDetails(data);
      const first = (data.seasons || []).find(s => s.season_number > 0);
      if (first) setSelSeason(first.season_number);
    }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [pick.id]);

  useEffect(() => {
    if (!details) return undefined;
    let alive = true;
    const season = selSeason;
    tmdb.getSeason(pick.id, season).then((data: { episodes?: Array<{ episode_number: number; name?: string }> } | null) => {
      if (!alive) return;
      setSeasonLoad({ season, episodes: data?.episodes || [], failed: !data });
    }).catch(() => { if (alive) setSeasonLoad({ season, episodes: [], failed: true }); });
    return () => { alive = false; };
  }, [details, pick.id, selSeason]);

  const episodes = seasonLoad.season === selSeason ? seasonLoad.episodes : null;
  const epFailed = seasonLoad.season === selSeason && seasonLoad.failed;

  const tick = async (ep: { episode_number: number; name?: string }) => {
    if (busy || !episodes) return;
    setBusy(true);
    setError('');
    const item = {
      id: pick.id,
      media_type: 'tv' as const,
      title: details?.name || pick.title,
      name: details?.name || pick.title,
      poster_path: details?.poster_path ?? pick.poster_path,
    };
    if (!watching.isWatching(pick.id)) {
      const started = await watching.startWatching(item);
      if (!started) { setError(T.steps.progress.saveError); setBusy(false); return; }
    }
    const next = pointerAfterEpisode(selSeason, ep.episode_number, episodes.length);
    if (!next) { setError(T.steps.progress.saveError); setBusy(false); return; }
    const result = await watching.setProgress(pick.id, next.season, next.episode, { reason: 'episode', undo: true });
    setBusy(false);
    if (!result?.ok) { setError(T.steps.progress.saveError); return; }
    onClose();
  };

  const seasons = (details?.seasons || []).filter(s => s.season_number > 0);
  const title = details?.name || pick.title;

  return (
    <BottomSheet title={T.steps.progress.title} sub={T.steps.progress.sheetSub(title)} onClose={onClose}>
      {failed && <Text style={styles.empty}>{MEDIA_PANEL.episodesLoadError}</Text>}
      {seasons.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRow}>
          {seasons.map(s => (
            <TouchableOpacity
              key={s.season_number}
              style={[styles.seasonPill, s.season_number === selSeason && styles.seasonPillOn]}
              onPress={() => setSelSeason(s.season_number)}
              accessibilityRole="button"
              accessibilityState={{ selected: s.season_number === selSeason }}
            >
              <Text style={styles.pillText}>{MEDIA_PANEL.seasonLabel(s.season_number)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      {!!error && <Text style={styles.empty}>{error}</Text>}
      {episodes === null && !failed ? <Text style={styles.empty}>{COMMON.loading}</Text> : null}
      {episodes && episodes.length === 0 ? (
        <Text style={styles.empty}>{epFailed ? MEDIA_PANEL.episodesLoadError : MEDIA_PANEL.noEpisodesAvailable}</Text>
      ) : null}
      {episodes?.map(ep => (
        <TouchableOpacity
          key={ep.episode_number}
          style={styles.ep}
          disabled={busy}
          onPress={() => tick(ep)}
          accessibilityRole="button"
          accessibilityLabel={T.steps.progress.tickEpisode(ep.episode_number, ep.name)}
        >
          <Text style={styles.epNum}>{`E${String(ep.episode_number).padStart(2, '0')}`}</Text>
          <Text style={styles.personName} numberOfLines={1}>{ep.name || MEDIA_PANEL.seasonEpisode(selSeason, ep.episode_number)}</Text>
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.xl, padding: spacing.lg, gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.34, color: colors.textPrimary },
  barFull: { flexBasis: '100%', flexDirection: 'row', gap: 3 },
  barSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceSunken },
  barSegOn: { backgroundColor: colors.accentFill },
  count: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textSecondary },
  hide: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  tiles: { gap: spacing.sm },
  tile: { gap: spacing.xs, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  tileDone: { opacity: 0.7 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tileTitle: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  tileSub: { marginLeft: 28, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  tileCta: { marginLeft: 28, marginTop: spacing.xs, alignSelf: 'flex-start' },
  tileCtaText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accent },

  ready: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginHorizontal: spacing.xl, marginBottom: spacing.xl, padding: spacing.lg, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  readyMark: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentFill },
  readyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  readyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },

  layer: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.imageScrim },
  sheet: { maxHeight: '88%', backgroundColor: colors.surfaceRaised, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg },
  grab: { alignSelf: 'center', marginTop: spacing.md, width: 40, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  sheetContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  sheetTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, lineHeight: 29, letterSpacing: -0.78, color: colors.textPrimary },
  sheetSub: { fontFamily: fontFamily.sans, fontSize: 14, lineHeight: 22, color: colors.textSecondary },
  sheetH: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary },
  sheetLink: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  sheetLinkText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
  empty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  personName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  personSub: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surfaceSunken },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  source: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.surfaceSunken },
  seasonRow: { gap: spacing.sm, paddingVertical: spacing.xs },
  seasonPill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  seasonPillOn: { borderColor: colors.accent },
  ep: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  epNum: { width: 36, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  pillOn: { borderColor: colors.accent },
  pillText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
});
