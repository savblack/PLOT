/**
 * After the building moment, before Home. The person's picks, a last-episode
 * tick, and Pick for Me. Skip goes to Home. Import and saved return paths
 * never land here (building.tsx). DOM-free logic lives in @plot/core.
 */
import { useMemo, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { COMMON } from '@plot/core/copy/common.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { markMediaAsWatched } from '@plot/core/mediaStatus.js';
import { useTvSeasonBrowser } from '@plot/core/useTvSeasonBrowser.js';
import { logLastEpisodeSeen } from '@plot/core/watchingProgress.js';
import { Palette, fontFamily, fontSize, posterUrl, radii, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useOnboardingFlow, type PickedTitle } from '../../contexts/OnboardingFlowContext';

const F = ONBOARDING_FLOW;

function titleOf(item: PickedTitle) {
  return item.title || item.name || F.untitled;
}

export default function FirstWin() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();
  const { watching, history, watchlist } = useAppData();
  const [openId, setOpenId] = useState<number | null>(null);
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);
  const browser = useTvSeasonBrowser(openId);

  const leave = (path: '/(app)' | '/(app)/tonight') => {
    // The auth guard releases the first-win hold once this route is gone.
    // Releasing first would let it send them Home before tonight opens.
    router.replace(path);
  };

  const markDone = (id: number) => setDoneIds(prev => (prev.includes(id) ? prev : [...prev, id]));

  const openPick = async (pick: PickedTitle) => {
    setRowError(null);
    if (pick.media_type !== 'tv') {
      setBusyId(pick.id);
      const result = await markMediaAsWatched({
        logWatched: () => history.logWatched({ ...pick, media_type: 'movie' }),
        clearWatching: async () => true,
        removeFromSaved: () => watchlist.removeFromList(pick.id),
        rollbackHistory: () => history.removeEntry(pick.id, 'movie'),
        mediaType: 'movie',
        isWatching: false,
        inList: watchlist.isInList(pick.id),
      });
      setBusyId(null);
      if (!result.ok) setRowError(MEDIA_PANEL.couldNotUpdateWatchStatus);
      else markDone(pick.id);
      return;
    }
    setOpenId(id => (id === pick.id ? null : pick.id));
  };

  const tickEpisode = async (episodeNumber: number) => {
    const pick = flow.seeds.find(item => item.id === openId);
    const episodes = browser.episodes;
    if (!pick || !episodes?.length) return;
    const episodeCount = episodes.reduce((max, ep) => Math.max(max, ep.episode_number), episodeNumber);
    setBusyId(pick.id);
    setRowError(null);
    const result = await logLastEpisodeSeen({
      startWatching: watching.startWatching,
      setProgress: watching.setProgress,
      show: pick,
      season: browser.season,
      episodeNumber,
      episodeCount,
    });
    setBusyId(null);
    if (!result.ok) setRowError(MEDIA_PANEL.couldNotUpdateWatchStatus);
    else {
      markDone(pick.id);
      setOpenId(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.top}>
        <Text style={styles.wordmark}>plot</Text>
        <Pressable onPress={() => leave('/(app)')} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.skip}>{F.skip}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{F.firstWin.title}</Text>
        {flow.seeds.length === 0 && <Text style={styles.empty}>{F.firstWin.empty}</Text>}
        {flow.seeds.map(pick => {
          const tv = pick.media_type === 'tv';
          const open = openId === pick.id && tv;
          const busy = busyId === pick.id;
          const done = doneIds.includes(pick.id);
          const uri = posterUrl(pick.poster_path, 'w185');
          return (
            <View key={`${pick.media_type}-${pick.id}`} style={styles.row}>
              <View style={styles.main}>
                {uri ? <Image source={{ uri }} style={styles.poster} /> : <View style={styles.poster} />}
                <Text style={styles.pickTitle} numberOfLines={2}>{titleOf(pick)}</Text>
                {done ? (
                  <Text style={styles.logged}>{F.firstWin.logged}</Text>
                ) : (
                  <Pressable
                    style={styles.action}
                    disabled={busy}
                    accessibilityRole="button"
                    onPress={() => openPick(pick)}
                  >
                    <Text style={styles.actionText}>
                      {busy ? COMMON.saving : tv ? F.firstWin.tickEpisode : MEDIA.markWatched}
                    </Text>
                  </Pressable>
                )}
              </View>
              {open && (
                <View style={styles.sheet}>
                  <Text style={styles.sub}>{F.firstWin.sheetSub(titleOf(pick))}</Text>
                  {browser.seasons && browser.seasons.length > 1 && (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasons}>
                      {browser.seasons.map(n => {
                        const on = n === browser.season;
                        return (
                          <Pressable
                            key={n}
                            style={[styles.season, on && styles.seasonOn]}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            onPress={() => browser.setSeason(n)}
                          >
                            <Text style={[styles.seasonText, on && styles.seasonTextOn]}>{MEDIA_PANEL.seasonLabel(n)}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )}
                  {browser.loading && <ActivityIndicator color={colors.accent} style={{ minHeight: 48 }} />}
                  {browser.failed && <Text style={styles.error}>{MEDIA_PANEL.episodesLoadError}</Text>}
                  {!browser.loading && !browser.failed && browser.episodes?.length === 0 && (
                    <Text style={styles.sub}>{MEDIA_PANEL.noEpisodesAvailable}</Text>
                  )}
                  {browser.episodes?.map(ep => (
                    <Pressable
                      key={ep.episode_number}
                      style={styles.ep}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={F.firstWin.tickLabel(ep.episode_number, ep.name)}
                      onPress={() => tickEpisode(ep.episode_number)}
                    >
                      <Text style={styles.epNum}>{ep.episode_number}</Text>
                      {ep.name ? <Text style={styles.epName}>{ep.name}</Text> : null}
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          );
        })}
        {rowError ? <Text style={styles.error}>{rowError}</Text> : null}
        <Pressable style={styles.tonight} accessibilityRole="button" onPress={() => leave('/(app)/tonight')}>
          <Text style={styles.tonightText}>{F.firstWin.tonight}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  wordmark: { fontFamily: fontFamily.display, fontSize: 22, letterSpacing: -1.1, color: colors.textPrimary },
  skip: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  title: {
    fontFamily: fontFamily.display,
    fontSize: 30,
    letterSpacing: -0.6,
    color: colors.textPrimary,
    lineHeight: 34,
  },
  empty: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22 },
  row: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    padding: spacing.sm,
    gap: spacing.sm,
  },
  main: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  poster: { width: 36, height: 54, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken },
  pickTitle: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  logged: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
  action: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceSunken,
  },
  actionText: { fontFamily: fontFamily.sansBold, fontSize: 13, color: colors.textPrimary },
  sheet: { paddingLeft: 48, gap: 4 },
  sub: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  seasons: { gap: spacing.sm, paddingVertical: spacing.sm },
  season: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seasonOn: { borderColor: colors.accent },
  seasonText: { fontFamily: fontFamily.sansMedium, fontSize: 13, color: colors.textSecondary },
  seasonTextOn: { color: colors.accentText },
  ep: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'baseline',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  epNum: { fontFamily: fontFamily.sansTabular, fontSize: fontSize.sm, color: colors.textSecondary, minWidth: 22 },
  epName: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
  error: { fontFamily: fontFamily.sans, fontSize: 13, color: colors.accentText },
  tonight: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.textPrimary,
    marginTop: spacing.sm,
  },
  tonightText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
});
