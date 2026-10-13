/**
 * Home's first-run card after onboarding: the RN counterpart of
 * apps/web/src/components/FinishingTouches.jsx. Four steps, each ticking only
 * when the action is really done (titles saved, someone followed, an import
 * finished, an actor or director followed). The rules, copy and stored state's
 * shape live in @plot/core/finishingTouches.js and copy/finishingTouches.js.
 *
 * Collapsed by default: web opens it on wide screens only, and a phone has none.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { followUser } from '@plot/core/useFollows.js';
import { usePeopleSuggestions } from '@plot/core/useHomeShelves.js';
import { deriveFinishingTouches, finishingTouchesVisible, type FinishingTouchesState } from '@plot/core/finishingTouches.js';
import { IMPORT_SOURCES } from '@plot/core/onboardingSetup.js';
import { IMPORT_ENTRY_POINTS, createImportReporter } from '@plot/core/importPipeline.js';
import { LETTERBOXD_IMPORT_ABANDON } from '@plot/core/letterboxdImportPrompt.js';
import { FINISHING_TOUCHES as T } from '@plot/core/copy/finishingTouches.js';
import { IMPORT_VIEW } from '@plot/core/copy/importView.js';
import { PEOPLE } from '@plot/core/copy/people.js';
import { supabase } from '../lib/supabase';
import { tmdb } from '../lib/tmdb';
import { track, EVENTS } from '../lib/analytics';
import { favoriteWords } from '../lib/spelling';
import {
  closeFinishingTouches, hideFinishingTouchesFor, markImportDone, readFinishingTouches,
} from '../lib/finishingTouches';
import { clearLetterboxdImport, readLetterboxdImportPrompt } from '../lib/letterboxdImportPrompt';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useFollows } from '../hooks/useFollows';
import ImportHistoryModal from './ImportHistoryModal';
import ImportSourceIcon from './ImportSourceIcon';
import { FollowPill, PersonFace } from './people/FollowControls';
import { useFollowPerson } from './people/useFollowPerson';

type Sheet = 'friends' | 'import' | 'people' | null;

/** Whether Home treats this account as first-run. Null until AsyncStorage answers. */
export function useFinishingTouchesState(userId: string | null | undefined) {
  const [state, setState] = useState<FinishingTouchesState | null>(null);
  const reload = useCallback(() => {
    readFinishingTouches(userId).then(setState);
  }, [userId]);
  useEffect(() => { reload(); }, [reload]);
  return { state, setState, reload, visible: finishingTouchesVisible(state) };
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
  const { userId, profile, watchlist } = useAppData();
  const follows = useFollows(userId, userId);
  const followPerson = useFollowPerson();
  const [expanded, setExpanded] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [letterboxdPrompt, setLetterboxdPrompt] = useState(false);
  const [letterboxdImport, setLetterboxdImport] = useState(false);
  const fav = favoriteWords(profile?.region);

  const refreshLetterboxd = useCallback(() => {
    readLetterboxdImportPrompt(userId).then(prompt => setLetterboxdPrompt(!!prompt));
  }, [userId]);
  useEffect(() => { refreshLetterboxd(); }, [refreshLetterboxd]);

  const savedCount = watchlist?.items?.length ?? 0;
  const { steps, doneCount, total, allDone } = deriveFinishingTouches({
    savedCount,
    followingCount: follows.following,
    importDone: !!state?.importDone,
    peopleCount: followPerson.follows.length,
  });

  if (!userId || !finishingTouchesVisible(state)) return null;

  const first = followPerson.follows[0]?.name;
  const tiles = steps.map(step => {
    if (step.id === 'watchlist') return { ...step, title: T.steps.watchlist.title, sub: T.steps.watchlist.sub(savedCount), cta: undefined };
    if (step.id === 'friends') {
      return { ...step, title: T.steps.friends.title, sub: step.done ? T.steps.friends.doneSub(follows.following) : T.steps.friends.sub, cta: T.steps.friends.cta };
    }
    if (step.id === 'import') {
      if (letterboxdPrompt && !step.done) {
        return {
          ...step,
          title: IMPORT_VIEW.letterboxdFinishTitle,
          sub: IMPORT_VIEW.letterboxdFinishSub,
          cta: IMPORT_VIEW.letterboxdFinishCta,
          dismiss: IMPORT_VIEW.letterboxdFinishDismiss,
        };
      }
      return { ...step, title: T.steps.import.title, sub: step.done ? T.steps.import.doneSub : T.steps.import.sub, cta: T.steps.import.cta, dismiss: undefined };
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
    refreshLetterboxd();
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
        <View style={styles.bar} accessibilityRole="image" accessibilityLabel={T.progressLabel(doneCount, total)}>
          {tiles.map((tile, i) => <View key={tile.id} style={[styles.barSeg, i < doneCount && styles.barSegOn]} />)}
        </View>
        <Text style={styles.count}>{T.count(doneCount, total)}</Text>
        <View style={{ flex: 1 }} />
        {expanded && (
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
        )}
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
                    if (tile.id === 'import' && letterboxdPrompt && !state?.importDone) {
                      setLetterboxdImport(true);
                      return;
                    }
                    setSheet(tile.id as Sheet);
                  }}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.tileCtaText}>{tile.cta} →</Text>
                </TouchableOpacity>
              )}
              {!tile.done && 'dismiss' in tile && tile.dismiss && (
                <TouchableOpacity
                  style={styles.tileDismiss}
                  onPress={async () => {
                    await clearLetterboxdImport(userId);
                    setLetterboxdPrompt(false);
                    createImportReporter({ entry: IMPORT_ENTRY_POINTS.FINISHING_TOUCHES }).abandoned(LETTERBOXD_IMPORT_ABANDON.DISMISSED);
                  }}
                  accessibilityRole="button"
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.tileDismissText}>{tile.dismiss}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      {sheet === 'friends' && <FriendsSheet userId={userId} onClose={closeSheet} />}
      {sheet === 'people' && <PeopleSheet watchlistItems={watchlist?.items ?? []} favourites={fav.pluralLower} follow={followPerson} onClose={closeSheet} />}
      {sheet === 'import' && !!userId && (
        <ImportSourceSheet
          userId={userId}
          onImported={async () => onState(await markImportDone(userId))}
          onClose={closeSheet}
        />
      )}
      {letterboxdImport && !!userId && (
        <ImportHistoryModal
          userId={userId}
          entry={IMPORT_ENTRY_POINTS.FINISHING_TOUCHES}
          initialPlatform="letterboxd"
          onImported={async () => onState(await markImportDone(userId))}
          onClose={() => { setLetterboxdImport(false); refreshLetterboxd(); }}
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
function ImportSourceSheet({ userId, onImported, onClose }: { userId: string; onImported: () => void; onClose: () => void }) {
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
      {IMPORT_SOURCES.map(src => (
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

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.xl, padding: spacing.lg, gap: spacing.md, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.34, color: colors.textPrimary },
  bar: { flexDirection: 'row', gap: 3 },
  barSeg: { width: 14, height: 6, borderRadius: 3, backgroundColor: colors.surfaceSunken },
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
  tileDismiss: { marginLeft: 28, alignSelf: 'flex-start' },
  tileDismissText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textMuted },

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
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  pillOn: { borderColor: colors.accent },
  pillText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
});
