/**
 * Dismissible card at the top of Home, after onboarding. The rules and copy
 * live in @plot/core. Web: apps/web/src/components/FirstWinCard.jsx.
 * This does not block the rest of Home.
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { firstHomeTitle, firstWinCardVisible, type FirstWinCardState } from '@plot/core/firstWinCard.js';
import { logLastEpisodeSeen } from '@plot/core/watchingProgress.js';
import { markMediaAsWatched } from '@plot/core/mediaStatus.js';
import { useTvSeasonBrowser } from '@plot/core/useTvSeasonBrowser.js';
import { ONBOARDING_FLOW as F } from '@plot/core/copy/onboardingFlow.js';
import { COMMON } from '@plot/core/copy/common.js';
import { MEDIA } from '@plot/core/copy/media.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { Palette, fontFamily, fontSize, posterUrl, radii, spacing } from '../lib/tokens';
import { dismissFirstWinFor, readFirstWinCard } from '../lib/firstWinCard';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';

export default function FirstWinCard({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { watchlist, watching, history } = useAppData();
  const [state, setState] = useState<FirstWinCardState | null>(null);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    readFirstWinCard(userId).then(next => {
      if (!alive) return;
      setState(next);
      setReady(true);
    });
    return () => { alive = false; };
  }, [userId]);

  const title = firstHomeTitle(watchlist?.items);
  const browser = useTvSeasonBrowser(open && title?.media_type === 'tv' ? title.id : null);

  if (!ready || !firstWinCardVisible(state)) return null;

  const dismiss = async () => setState(await dismissFirstWinFor(userId));

  const markMovie = async () => {
    if (!title || busy) return;
    setBusy(true);
    setError('');
    const result = await markMediaAsWatched({
      logWatched: () => history.logWatched({ ...title, media_type: 'movie' }),
      clearWatching: async () => true,
      removeFromSaved: () => watchlist.removeFromList(title.id),
      rollbackHistory: () => history.removeEntry(title.id, 'movie'),
      mediaType: 'movie',
      isWatching: false,
      inList: !!watchlist.isInList?.(title.id),
    });
    setBusy(false);
    if (!result.ok) setError(MEDIA_PANEL.couldNotUpdateWatchStatus);
    else setLogged(true);
  };

  const tick = async (episodeNumber: number) => {
    if (!title || !browser.episodes?.length || busy) return;
    const episodeCount = browser.episodes.reduce((max: number, ep: { episode_number: number }) => Math.max(max, ep.episode_number), episodeNumber);
    setBusy(true);
    setError('');
    const result = await logLastEpisodeSeen({
      startWatching: watching.startWatching,
      setProgress: watching.setProgress,
      show: { ...title, name: title.title },
      season: browser.season,
      episodeNumber,
      episodeCount,
    });
    setBusy(false);
    if (!result.ok) setError(MEDIA_PANEL.couldNotUpdateWatchStatus);
    else { setLogged(true); setOpen(false); }
  };

  const show = title?.media_type === 'tv';
  const uri = title?.poster_path ? posterUrl(title.poster_path, 'w185') : null;

  return (
    <View style={styles.card} accessibilityLabel={F.firstWin.title}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">{F.firstWin.title}</Text>
        <Pressable onPress={dismiss} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.skip}>{F.skip}</Text>
        </Pressable>
      </View>
      {!title && <Text style={styles.empty}>{F.firstWin.empty}</Text>}
      {title && (
        <View style={styles.row}>
          {uri ? <Image source={{ uri }} style={styles.poster} /> : <View style={styles.poster} />}
          <Text style={styles.name} numberOfLines={2}>{title.title}</Text>
          {logged
            ? <Text style={styles.logged}>{F.firstWin.logged}</Text>
            : (
              <TouchableOpacity
                style={styles.pill}
                disabled={busy}
                onPress={() => { if (show) { setError(''); setOpen(on => !on); } else markMovie(); }}
                accessibilityRole="button"
              >
                <Text style={styles.pillText}>{busy ? COMMON.saving : show ? F.firstWin.tickEpisode : MEDIA.markWatched}</Text>
              </TouchableOpacity>
            )}
        </View>
      )}
      {open && show && title && (
        <>
          <Text style={styles.empty}>{F.firstWin.sheetSub(title.title)}</Text>
          {browser.seasons && browser.seasons.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonRow}>
              {browser.seasons.map((n: number) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.pill, n === browser.season && styles.pillOn]}
                  onPress={() => browser.setSeason(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: n === browser.season }}
                >
                  <Text style={styles.pillText}>{MEDIA_PANEL.seasonLabel(n)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {browser.loading && <Text style={styles.empty}>{COMMON.loading}</Text>}
          {browser.failed && <Text style={styles.error}>{MEDIA_PANEL.episodesLoadError}</Text>}
          {!browser.loading && !browser.failed && browser.episodes && browser.episodes.length === 0 && (
            <Text style={styles.empty}>{MEDIA_PANEL.noEpisodesAvailable}</Text>
          )}
          {browser.episodes?.map((ep: { episode_number: number; name: string }) => (
            <TouchableOpacity
              key={ep.episode_number}
              style={styles.ep}
              disabled={busy}
              onPress={() => tick(ep.episode_number)}
              accessibilityRole="button"
              accessibilityLabel={F.firstWin.tickLabel(ep.episode_number, ep.name)}
            >
              <Text style={styles.epNum}>{ep.episode_number}</Text>
              <Text style={styles.name} numberOfLines={1}>{ep.name}</Text>
            </TouchableOpacity>
          ))}
        </>
      )}
      {!!error && <Text style={styles.error}>{error}</Text>}
      <TouchableOpacity style={styles.pill} onPress={() => router.push('/(app)/tonight' as Href)} accessibilityRole="button">
        <Text style={styles.pillText}>{F.firstWin.tonight}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl, marginBottom: spacing.lg, padding: spacing.lg, gap: spacing.sm,
    borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    alignItems: 'flex-start',
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, alignSelf: 'stretch' },
  title: { flex: 1, fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.34, color: colors.textPrimary },
  skip: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  empty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.accent },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'stretch' },
  poster: { width: 36, height: 54, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken },
  name: { flex: 1, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  logged: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },
  pill: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  pillOn: { borderColor: colors.accent },
  pillText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  seasonRow: { gap: spacing.sm },
  ep: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, alignSelf: 'stretch', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  epNum: { width: 24, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
});
