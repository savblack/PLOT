import { useEpisodeWatches, useSpecialEpisodeWatches } from '@plot/core/useEpisodeWatches.js';
import { getEpisodeGuideState } from '@plot/core/episodeProgress.js';
import StreamingAlertsCard from './StreamingAlertsCard';
import EpisodeAlertsCard from './EpisodeAlertsCard';
import TitleFootBar from './TitleFootBar';
import { buildTitleShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { shareLink } from '../lib/share';
import { customListCreationError, isCustomListLimitError } from '@plot/core/customListCreation.js';
/**
 * MediaPanel — slide-up detail sheet, mobile port of web MediaPanel.jsx.
 * Sections: cover band with overlapping poster, compact action row, up next,
 * where to watch, scores, then episodes. Your take stays pinned under the scroll.
 */
import { localDateStr } from '@plot/core/date.js';
import { markMediaAsWatched, moveSavedShowToWatching } from '@plot/core/mediaStatus.js';
import { useEffect, useState, useRef, useMemo } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Dimensions, ActivityIndicator, TextInput, Animated, Linking, Alert,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import Svg, { Path, Line, Polyline, Circle, Polygon, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tmdb, getTmdbRegion } from '../lib/tmdb';
import { backdropUrl, posterUrl, logoUrl, Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { favoriteWords } from '../lib/spelling';
import { FAVOURITES_ENABLED } from '@plot/core/features.js';
import { findDuplicateCustomList } from '@plot/core/customLists.js';
import { mediaTypeFromItem, recommendationsFromDetails, releaseDateFromItem, titleFromItem } from '@plot/core/media.js';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { buildWatchLink } from '@plot/core/watchLinks.js';
import {
  getLastSeasonNumber,
  getSeasonToggleProgress,
  getSeasonWatchState,
  guideSeasonSelection,
  guideSeasons,
  isSeriesComplete,
} from '@plot/core/watchingProgress.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { endsAtTime, fallbackEpisodeRuntime, showTimeLeft, timeLeftCaption } from '@plot/core/timeLeft.js';
import { COMMON } from '@plot/core/copy/common.js';
import { track, EVENTS, captureException } from '../lib/analytics';
import UpgradeSheet from './UpgradeSheet';
import { useRouter, type Href } from 'expo-router';
import { PEOPLE } from '@plot/core/copy/people.js';
import { CastFollowCard, CrewFollowRow } from './people/FollowControls';
import { useFollowPerson } from './people/useFollowPerson';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';
import { SHOW_WATCH_TOGETHER } from '../lib/launchFeatures';
import { SavedByToo } from './watch/SavedByToo';
import { fetchVerifiedAvailability, offersFromTmdb, networksFromDetails, regionDisplayName } from '@plot/core/availability.js';
import { fetchCriticScore, pickAudienceQuote, getConsensusLine, audienceScoreFromDetails } from '@plot/core/reviews.js';
import { canCreateCustomList } from '@plot/core/premium.js';
import { TOP_LIST_SIZE } from '@plot/core/listCollections.js';
import { TrailerPlayer } from './TrailerPlayer';
import CollectionCard from './CollectionCard';
import { MEDIA } from '@plot/core/copy/media.js';
import UndoToast from './UndoToast';
import NoticeToast from './NoticeToast';
import { clearUndo } from '@plot/core/undo.js';


const SCREEN_H = Dimensions.get('window').height;
const SCREEN_W = Dimensions.get('window').width;
const PANEL_H  = SCREEN_H * 0.92;

// ── helpers ───────────────────────────────────────────────────────────

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
    <Svg width={17} height={17} viewBox="0 0 24 24" fill={filled ? colors.accent : 'none'} stroke={filled ? colors.accent : colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
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
function IconPlayTrailer() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="#fff" stroke="#fff" strokeWidth={1} strokeLinejoin="round">
      <Polygon points="8,4 21,12 8,20" />
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
      <Circle cx={12} cy={12} r={10} fill={colors.accent} stroke={colors.accent} strokeWidth={1.5} />
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
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={8} y1={6} x2={21} y2={6} /><Line x1={8} y1={12} x2={21} y2={12} /><Line x1={8} y1={18} x2={21} y2={18} />
      <Line x1={3} y1={6} x2={3.01} y2={6} /><Line x1={3} y1={12} x2={3.01} y2={12} /><Line x1={3} y1={18} x2={3.01} y2={18} />
    </Svg>
  );
}
function IconShare() {
  const { colors } = useTheme();
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} /><Circle cx={6} cy={12} r={3} /><Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} /><Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}
function IconBookmark({ saved }: { saved: boolean }) {
  const { colors } = useTheme();
  const ink = saved ? colors.statusWatched : colors.onAccentFill;
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill={saved ? ink : 'none'} stroke={ink} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}
// ── Episode guide ─────────────────────────────────────────────────────
function EpisodeGuide({ tvId, progress, details, watching, onSeriesFinished }: { tvId: number; progress: any; details: any; watching: any; onSeriesFinished?: () => Promise<{ ok: boolean; error?: string }> }) {
  const { colors } = useTheme();
  const { userId } = useAppData();
  const sparse = useEpisodeWatches(userId, tvId);
  const specials = useSpecialEpisodeWatches(userId, tvId);
  const episodeStates = { ...specials.states, ...sparse.states };
  const isTracking = !!progress || sparse.hasEpisodes;
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const seasons = guideSeasons(details, episodeStates);
  const [selSeason, setSelSeason] = useState(progress?.current_season || 1);
  const guideSeason = guideSeasonSelection(seasons, selSeason);
  const [episodes,  setEpisodes]  = useState<any[]>([]);
  const [loading,   setLoading]   = useState(false);
  const progressBlocked = sparse.loading || sparse.refreshing || sparse.error || specials.loading || specials.refreshing || specials.error || loading;
  const [toggling,  setToggling]  = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const [seasonPending, setSeasonPending] = useState(false);
  const [seasonMenuOpen, setSeasonMenuOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    tmdb.getSeason(tvId, guideSeason).then((data: any) => {
      if (cancelled) return;
      setEpisodes(data?.episodes ?? []);
      setLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setEpisodes([]);
      setActionError(MEDIA_PANEL.episodesLoadError);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [tvId, guideSeason]);

  const curSeason = progress?.current_season || 0;
  const curEp     = progress?.current_episode || 0;
  const episodeState = (episodeNumber: number) => getEpisodeGuideState({
    currentSeason: curSeason, currentEpisode: curEp, selectedSeason: guideSeason,
    episodeNumber, episodeStates,
  });

  /* ── Finish the series when progress rolls past its final season ──
     Mirrors web's MediaPanel: an ended show whose last episode you just
     ticked stops being "currently watching" and lands in your history,
     instead of parking the pointer on a season that will never air. Shows
     still in production are left alone. */
  const lastSeason = getLastSeasonNumber(details);

  const finishSeriesIfComplete = async (nextSeason: number | undefined) => {
    if (!isSeriesComplete({ lastSeason, nextSeason, status: details?.status })) return;
    // The tick that got here offered an undo; reversing only it would leave
    // the completion (history row, stopped watching) behind.
    clearUndo();
    // Finishing a show is the end of the engagement arc worth naming, and it's
    // only knowable here — core sees pointer moves, not the last season.
    track(EVENTS.SERIES_COMPLETED, { tmdb_id: tvId, seasons: lastSeason });
    const result = await onSeriesFinished?.();
    if (result && !result.ok) setActionError(result.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
  };

  const handleToggle = async (ep: any) => {
    if (!isTracking || progressBlocked || seasonPending || toggling !== null) return;
    setToggling(ep.episode_number);
    setActionError('');
    const watched = episodeState(ep.episode_number).isWatched;
    if (guideSeason === 0) {
      const ok = specials.delegates
        ? await sparse.setWatched(0, [ep.episode_number], !watched)
        : await specials.setWatched([ep.episode_number], !watched);
      if (!ok) setActionError(MEDIA_PANEL.couldNotUpdateWatchStatus);
      setToggling(null);
      return;
    }
    if (sparse.hasEpisodes) {
      const ok = await sparse.setWatched(guideSeason, [ep.episode_number], !watched);
      if (!ok) setActionError(MEDIA_PANEL.couldNotUpdateWatchStatus);
      setToggling(null);
      return;
    }
    if (!watched) {
      /* Ticking the episode you're actually up to goes through
         markEpisodeWatched, which handles season rollover when the season's
         episode count isn't known from `episodes`. Neither it nor the
         branches below write history: that row means the title is watched,
         and finishSeriesIfComplete logs it once the series is done. Mirrors
         web's MediaPanel. */
      if (guideSeason === curSeason && ep.episode_number === curEp) {
        const result = await watching.markEpisodeWatched(tvId, { undo: true });
        if (!result?.ok) {
          setActionError(result?.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
        } else {
          // markEpisodeWatched rolls the season over internally, so the row it
          // returns is the only reliable read of where the pointer landed.
          await finishSeriesIfComplete(result.data?.current_season);
        }
      } else if (ep.episode_number < episodes.length) {
        await watching.setProgress(tvId, guideSeason, ep.episode_number + 1, { undo: true });
      } else {
        await watching.setProgress(tvId, guideSeason + 1, 1, { undo: true });
        await finishSeriesIfComplete(guideSeason + 1);
      }
    } else {
      await watching.setProgress(tvId, guideSeason, ep.episode_number, { undo: true });
    }
    setToggling(null);
  };

  /* ── Mark / unmark the whole selected season ── */
  const seasonState = getSeasonWatchState({
    currentEpisode: curEp,
    currentSeason: curSeason,
    episodeCount: episodes.length,
    episodeNumbers: episodes.map(ep => ep.episode_number),
    episodeStates,
    selectedSeason: guideSeason,
  });

  const handleToggleSeason = async () => {
    if (!isTracking || progressBlocked || seasonPending || toggling !== null) return;
    if (guideSeason === 0) {
      setSeasonPending(true);
      setActionError('');
      const numbers = episodes.map(ep => ep.episode_number);
      const ok = specials.delegates
        ? await sparse.setWatched(0, numbers, !seasonState.isComplete)
        : await specials.setWatched(numbers, !seasonState.isComplete);
      if (!ok) setActionError(MEDIA_PANEL.couldNotUpdateSeason);
      setSeasonPending(false);
      return;
    }
    if (sparse.hasEpisodes) {
      setSeasonPending(true);
      setActionError('');
      const ok = await sparse.setWatched(guideSeason, episodes.map(ep => ep.episode_number), !seasonState.isComplete);
      if (!ok) setActionError(MEDIA_PANEL.couldNotUpdateSeason);
      setSeasonPending(false);
      return;
    }
    const target = getSeasonToggleProgress({
      isComplete: seasonState.isComplete,
      selectedSeason: guideSeason,
    });
    if (!target.ok) {
      setActionError(target.error!);
      return;
    }

    setSeasonPending(true);
    setActionError('');
    const result = await watching.setProgress(tvId, target.nextSeason, target.nextEpisode, { reason: 'season', undo: true });
    if (!result?.ok) {
      setActionError(MEDIA_PANEL.couldNotUpdateSeason);
    } else if (!seasonState.isComplete) {
      await finishSeriesIfComplete(target.nextSeason);
    }
    setSeasonPending(false);
  };

  return (
    <View>
      {/* Season pill and the bulk action share one line. The chip strip it
          replaces grew a row for every season. */}
      <View style={styles.seasonRow}>
        {seasons.length > 1 ? (
          <View>
            <TouchableOpacity
              style={styles.seasonPill}
              onPress={() => setSeasonMenuOpen(v => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: seasonMenuOpen }}
              accessibilityLabel={MEDIA_PANEL.chooseSeason}
            >
              <Text style={styles.seasonPillText}>{MEDIA_PANEL.seasonListLabel(guideSeason)}</Text>
              <IconChevron dir={seasonMenuOpen ? 'up' : 'down'} />
            </TouchableOpacity>
            {seasonMenuOpen && (
              <View style={styles.seasonMenu}>
                {seasons.map((s: any) => (
                  <TouchableOpacity
                    key={s.season_number}
                    style={styles.seasonMenuItem}
                    onPress={() => { setSelSeason(s.season_number); setSeasonMenuOpen(false); }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.seasonMenuText, s.season_number === guideSeason && { color: colors.accentText }]}>
                      {MEDIA_PANEL.seasonListLabel(s.season_number)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.seasonPill}>
            <Text style={styles.seasonPillText}>{MEDIA_PANEL.seasonListLabel(guideSeason)}</Text>
          </View>
        )}
        {isTracking && episodes.length > 0 && (
          <TouchableOpacity
            onPress={handleToggleSeason}
            disabled={seasonPending || progressBlocked || toggling !== null}
            accessibilityRole="button"
            accessibilityState={{ disabled: seasonPending || progressBlocked || toggling !== null }}
          >
            <Text style={styles.seasonBulkLink}>
              {seasonPending
                ? MEDIA_PANEL.updating
                : seasonState.isComplete
                  ? (guideSeason === 0 ? MEDIA_PANEL.unmarkSpecialsWatched : MEDIA_PANEL.unmarkSeasonWatched)
                  : (guideSeason === 0 ? MEDIA_PANEL.markSpecialsWatched : MEDIA_PANEL.markSeasonWatched)}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {sparse.hasEpisodes && <Text style={styles.seasonBulkCount}>{MEDIA_PANEL.sparseEpisodeProgress}</Text>}
      {(sparse.error || specials.error) && (
        <View>
          <Text style={styles.epActionError}>{MEDIA_PANEL.episodeProgressLoadError}</Text>
          <TouchableOpacity onPress={() => { sparse.reload(); specials.reload(); }} accessibilityRole="button" style={styles.seasonBulkBtn}>
            <Text style={styles.seasonBulkBtnText}>{MEDIA_PANEL.retryEpisodeProgress}</Text>
          </TouchableOpacity>
        </View>
      )}
      {actionError ? <Text style={styles.epActionError}>{actionError}</Text> : null}

      {loading || sparse.loading || specials.loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginVertical: spacing.lg }} />
      ) : (
        episodes.map(ep => {
          const { isWatched: watched, isCurrent: current } = episodeState(ep.episode_number);
          const isToggling = toggling === ep.episode_number;
          const epCode = `S${String(guideSeason).padStart(2,'0')}E${String(ep.episode_number).padStart(2,'0')}`;
          return (
            <View key={ep.id} style={[styles.epRow, current && styles.epRowCurrent, watched && styles.epRowWatched]}>
              <Text style={[styles.epCode, current && styles.epCodeCurrent]}>
                E{String(ep.episode_number).padStart(2, '0')}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.epTitle, watched && styles.epTitleWatched, current && styles.epTitleCurrent]} numberOfLines={2}>{ep.name}</Text>
                {ep.air_date ? <Text style={styles.epAirDate}>{ep.air_date}</Text> : null}
              </View>
              {isTracking && (
                isToggling ? (
                  <ActivityIndicator size="small" color={colors.chipEpisode} />
                ) : (
                  <TouchableOpacity
                    onPress={() => handleToggle(ep)}
                    disabled={progressBlocked || seasonPending || toggling !== null}
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

// Mid-watch summary. Same pointer as the episode guide, advanced through
// markEpisodeWatched, so the card and the list can't disagree.
type UpNextEpisode = { episode_number: number; name?: string; still_path?: string | null; runtime?: number | null };
type UpNextOffer = { provider_name?: string };

function UpNextCard({ tvId, details, progress, whereToWatch, onSeriesFinished }: {
  tvId: number;
  details: TMDBDetails;
  progress?: { current_season?: number; current_episode?: number } | null;
  whereToWatch: { streaming: UpNextOffer[]; rentBuy: UpNextOffer[] };
  onSeriesFinished?: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { watching } = useAppData();
  const [episodes, setEpisodes] = useState<UpNextEpisode[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const season = progress?.current_season || 0;
  const episodeNumber = progress?.current_episode || 0;

  useEffect(() => {
    if (!season) return undefined;
    let cancelled = false;
    tmdb.getSeason(tvId, season).then((data: { episodes?: UpNextEpisode[] } | null) => {
      if (!cancelled) setEpisodes(data?.episodes || []);
    });
    return () => { cancelled = true; };
  }, [tvId, season]);

  const episode = episodes.find(e => e.episode_number === episodeNumber);
  if (!season || !episodeNumber) return null;

  const watchedInSeason = Math.max(0, episodeNumber - 1);
  const seasonTotal = episodes.length;
  const offer = whereToWatch.streaming[0] || whereToWatch.rentBuy[0] || null;
  const still = episode?.still_path ? backdropUrl(episode.still_path, 'w300') : null;
  const episodeMinutes = episode?.runtime && episode.runtime > 0 ? episode.runtime : fallbackEpisodeRuntime(details);
  const runtime = episodeMinutes ? MEDIA_PANEL.episodeRuntime(episodeMinutes) : '';
  const ends = episodeMinutes ? endsAtTime(episodeMinutes) : null;
  const where = [offer?.provider_name, runtime, ends ? MEDIA_PANEL.endsAt(ends) : ''].filter(Boolean).join(' · ');
  const leftCaption = timeLeftCaption(showTimeLeft({
    details,
    season,
    episode: episodeNumber,
    knownEpisodes: episodes.map(item => ({ ...item, season_number: season })),
  }));

  const markWatched = async () => {
    if (pending) return;
    setPending(true);
    setError('');
    const result = await watching.markEpisodeWatched(tvId, { undo: true });
    if (!result?.ok) {
      setError(result?.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
    } else if (isSeriesComplete({
      lastSeason: getLastSeasonNumber(details),
      nextSeason: result.data?.current_season,
      status: details?.status,
    })) {
      track(EVENTS.SERIES_COMPLETED, { tmdb_id: tvId, seasons: getLastSeasonNumber(details) });
      clearUndo();
      const finished = await onSeriesFinished?.();
      if (finished && !finished.ok) setError(finished.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
    }
    setPending(false);
  };

  return (
    <View style={styles.upNextCard}>
      <Text style={styles.upNextTitle}>{MEDIA_PANEL.upNext}</Text>
      <View style={styles.upNextRow}>
        <View style={styles.upNextStill}>
          {still ? <Image source={{ uri: still }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.upNextKicker}>{MEDIA_PANEL.seasonEpisode(season, episodeNumber)}</Text>
          <Text style={styles.upNextName} numberOfLines={2}>{episode?.name || MEDIA_PANEL.seasonEpisode(season, episodeNumber)}</Text>
          {!!where && <Text style={styles.upNextWhere} numberOfLines={1}>{where}</Text>}
        </View>
        <TouchableOpacity style={styles.upNextBtn} onPress={markWatched} disabled={pending} accessibilityRole="button">
          <IconCheck color={colors.onAccentFill} />
          <Text style={styles.upNextBtnText}>{pending ? MEDIA_PANEL.updating : MEDIA.markWatched}</Text>
        </TouchableOpacity>
      </View>
      {seasonTotal > 0 && (
        <View
          style={styles.upNextTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: seasonTotal, now: watchedInSeason }}
          accessibilityLabel={MEDIA_PANEL.seasonWatchedCount(watchedInSeason, seasonTotal)}
        >
          <View style={[styles.upNextFill, { width: `${Math.round((watchedInSeason / seasonTotal) * 100)}%` }]} />
        </View>
      )}
      {!!leftCaption && <Text style={styles.upNextLeft}>{leftCaption}</Text>}
      {!!error && <Text style={styles.epActionError}>{error}</Text>}
    </View>
  );
}

// ── TMDB detail shapes ────────────────────────────────────────────────
interface TMDBNextEpisode {
  air_date?: string;
  name?: string;
  episode_number?: number;
  season_number?: number;
  runtime?: number | null;
}

interface TMDBSeason {
  season_number: number;
  name: string;
  episode_count?: number;
}

interface TMDBGenre {
  id: number;
  name: string;
}

interface CreditPerson {
  id: number;
  name: string;
  profile_path?: string | null;
  character?: string;
  job?: string;
  roles?: { character?: string }[];
}

interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  overview?: string;
  credits?: { cast?: CreditPerson[]; crew?: CreditPerson[] };
  aggregate_credits?: { cast?: CreditPerson[] };
  created_by?: CreditPerson[];
  release_date?: string;
  first_air_date?: string;
  backdrop_path?: string | null;
  poster_path?: string | null;
  vote_average?: number;
  vote_count?: number;
  genres?: TMDBGenre[];
  runtime?: number;
  episode_run_time?: number[];
  number_of_seasons?: number;
  seasons?: TMDBSeason[];
  next_episode_to_air?: TMDBNextEpisode | null;
  last_episode_to_air?: TMDBNextEpisode | null;
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
  const [showUpgrade, setShowUpgrade] = useState(false);
  const router = useRouter();
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
      track(EVENTS.PREMIUM_GATE_HIT, { feature: 'custom_lists' });
      setShowUpgrade(true);
      return;
    }
    setBusy(true);
    try {
      const newList = await createList(trimmed);
      if (!newList) { setError(MEDIA.couldNotCreateList); return; }
      await addItem(newList.id, item);
      setCreating(false); setName(''); setError('');
    } catch (error) {
      if (isCustomListLimitError(error)) setShowUpgrade(true);
      else setError(customListCreationError(error, MEDIA.couldNotCreateList));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <UpgradeSheet visible={showUpgrade} reason="lists" onClose={() => setShowUpgrade(false)} onCompare={() => { onClose(); router.push(PREMIUM_SETTINGS_PATH as any); }} />
      <TouchableOpacity style={styles.lsOverlay} onPress={onClose} activeOpacity={1} />
      <View style={[styles.lsSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.lsHandle} />
        <Text style={styles.lsTitle}>Add to list</Text>

        {!!topLists && (
          <View style={styles.lsTopSection}>
            <TouchableOpacity style={styles.lsRow} onPress={() => setTopOpen(o => !o)} activeOpacity={0.7}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lsName}>{topListType === 'tv' ? MEDIA_PANEL.topFiveTvShows : MEDIA_PANEL.topFiveMovies}</Text>
                <Text style={styles.lsCount}>{currentRank ? MEDIA_PANEL.currentlyRanked(currentRank) : MEDIA_PANEL.notRanked}</Text>
              </View>
              <View style={[styles.lsCheck, currentRank && styles.lsCheckOn]}>
                {currentRank ? <Text style={styles.lsTopCheckNum}>{currentRank}</Text> : null}
              </View>
            </TouchableOpacity>
            {topOpen && (
              <View style={styles.lsTopGrid}>
                {Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1).map(rank => {
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
                onPress={() => checked ? removeItem(list.id, item.id, { undo: true }) : addItem(list.id, item)}
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
              {Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1)
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
            {Array.from({ length: TOP_LIST_SIZE }, (_, i) => i + 1).filter(r => r !== moveToPicker.rank && !topItems.find((t: any) => t.rank === r)).length === 0 && (
              <Text style={styles.lsEmpty}>No open spots — every other rank is taken.</Text>
            )}
          </View>
        </Modal>
      )}
      {/* The list sheet is its own Modal, over the panel's, so it needs its own toast. */}
      <UndoToast placement="panel" />
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
  const { userId, profile, watchlist, watching, favorites, history, customLists, topLists, privateNotes } = useAppData();
  const { open: openTitle } = useMediaPanel();
  const router = useRouter();
  const followPerson = useFollowPerson();
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
  const [watchOpen, setWatchOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [statusPending, setStatusPending] = useState('');
  // True while a watched or watching change started from the foot bar is in flight.
  const [footBusy, setFootBusy] = useState(false);

  const slideY = useRef(new Animated.Value(PANEL_H)).current;
  const scrollRef = useRef<ScrollView>(null);

  const isMovie    = itemType === 'movie';
  const inList     = watchlist.isInList(itemId);
  const isWatching = !isMovie && watching.isWatching(itemId);
  const progress   = watching.getProgress(itemId);
  const watched    = history.isWatched(itemId, itemType);
  const isFav      = favorites.isFavorite(itemId);
  const similar    = recommendationsFromDetails(details);
  const isInAnyList = customLists.lists.some((l: any) => customLists.isInList(l.id, itemId));
  const watchedEntry = history.entries?.find((e: any) => e.tmdb_id === Number(itemId) && e.media_type === itemType);
  // Default to the day the title was SAVED, not today — if it sat on the
  // watchlist for a month before being marked watched, "today" is the one date
  // it almost certainly wasn't. Web makes the same call. Falls back to today
  // when it was never saved first.
  const watchlistEntry   = watchlist.items?.find((i: any) => Number(i.tmdb_id) === Number(itemId));
  const defaultWatchedAt = watchlistEntry?.created_at ? String(watchlistEntry.created_at).slice(0, 10) : localDateStr();

  // Marking something watched retires it from the watchlist: it's no longer
  // something you want to watch. core's markMediaAsWatched sequences that and
  // rolls the history entry back if a later step fails, so a half-applied
  // state can't be left behind. Shared by the Watched button and by the
  // episode guide, which calls it when the final episode of an ended series
  // is ticked.
  // `rating` lets the foot bar log a title as watched and rated in one write, through
  // the same save-side effects as the status menu.
  const markWatchedNow = async (dnf = false, rating?: number) => {
    const sameState = watched && (!!watchedEntry?.dnf === dnf);
    if (sameState) {
      const removed = await history.removeEntry(itemId, itemType, { undo: true });
      return removed
        ? { ok: true }
        : { ok: false, error: MEDIA_PANEL.couldNotClearWatchStatus };
    }
    const result = await markMediaAsWatched({
      logWatched: () => history.logWatched(
        { ...details, id: itemId, media_type: itemType },
        { dnf, rating, watchedAt: defaultWatchedAt },
      ),
      clearWatching:   () => watching.stopWatching(itemId),
      removeFromSaved: () => watchlist.removeFromList(itemId),
      rollbackHistory: () => history.removeEntry(itemId, itemType),
      mediaType: itemType,
      isWatching,
      inList,
    });
    return result;
  };

  // Already-watched shows are a no-op rather than a toggle-off: this fires
  // from episode ticks, not from a button the user aimed at it.
  const handleSeriesFinished = async () => {
    if (watched) return { ok: true };
    const result = await markWatchedNow();
    // Report the driver's message rather than showing it; see the web panel.
    if (!result.ok) {
      const detail = history.getLastError();
      if (detail) captureException(new Error(detail), { surface: 'media_panel', action: 'watched_status' });
    }
    return result;
  };

  const handleSaveFromPanel = async () => {
    if (!details) return;
    if (inList) {
      await watchlist.removeFromList(itemId, { undo: true });
      return;
    }
    await watchlist.addToList({ ...details, id: itemId, media_type: itemType });
  };

  /* The foot bar's writes. Each resolves to what the bar needs to know: whether it
     worked. A failed status change surfaces in an alert, as the status menu does. */
  const footMarkWatched = async (opts?: { rating?: number }) => {
    if (footBusy) return { ok: false };
    setFootBusy(true);
    try {
      const result = await markWatchedNow(false, opts?.rating);
      if (!result.ok) {
        const detail = history.getLastError();
        if (detail) captureException(new Error(detail), { surface: 'media_panel', action: 'watched_status' });
        Alert.alert('Could not update', result.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
      }
      return result;
    } finally {
      setFootBusy(false);
    }
  };

  const footStartWatching = async () => {
    if (footBusy || isMovie) return;
    setFootBusy(true);
    try {
      const result = await moveSavedShowToWatching({
        startWatching: () => watching.startWatching({ ...details, id: itemId, media_type: 'tv' }),
        removeFromSaved: () => inList ? watchlist.removeFromList(itemId) : Promise.resolve(true),
        rollbackWatching: () => watching.stopWatching(itemId),
      });
      if (!result.ok) Alert.alert('Could not update', result.error);
    } finally {
      setFootBusy(false);
    }
  };

  // The bar's own Undo, inside its six seconds: a plain removal. The status menu's
  // removal offers the app's undo toast; this would be a second one.
  const footUndoWatched = async () => {
    if (footBusy) return false;
    setFootBusy(true);
    try {
      return !!await history.removeEntry(itemId, itemType);
    } finally {
      setFootBusy(false);
    }
  };

  const runStatusAction = async (action: () => Promise<{ ok: boolean; error?: string }>) => {
    if (statusPending) return;
    setStatusPending(MEDIA_PANEL.updating);
    try {
      const result = await action();
      if (!result?.ok) Alert.alert('Could not update', result.error || MEDIA_PANEL.couldNotUpdateWatchStatus);
    } finally {
      setStatusPending('');
      setStatusMenuOpen(false);
    }
  };

  const handleShare = () => shareLink({
    url: buildTitleShareUrl({ tmdbId: itemId, mediaType: itemType, source: 'panel' }),
    title: details?.title || details?.name,
    text: SHARING.titleText(details?.title || details?.name || ''),
    event: EVENTS.TITLE_SHARED,
    eventProps: { tmdb_id: itemId, media_type: itemType, source: 'panel' },
  });

  // Reset panel chrome when the open title changes.
  useEffect(() => {
    setWatchOpen(false);
    setStatusMenuOpen(false);
  }, [itemId, itemType]);

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
        track(EVENTS.TITLE_VIEWED, { tmdb_id: itemId, media_type: itemType });
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
      track(EVENTS.WATCH_LINK_CLICKED, {
        tmdb_id: itemId, media_type: itemType,
        provider: p.provider_name ?? null, link_kind: link.kind ?? null,
      });
      Linking.openURL(link.url).catch((e) => {
        console.warn('[MediaPanel] failed to open watch link', e);
        Alert.alert("Couldn't open link", 'Please try again in a moment.');
      });
    }
  };
  const releaseDate = details?.release_date || details?.first_air_date || '';
  const year = releaseDate ? String(new Date(releaseDate).getFullYear()) : '';
  const runtimeText = isMovie
    ? (details?.runtime
        ? (details.runtime >= 60
            ? `${Math.floor(details.runtime / 60)}h ${details.runtime % 60}m`
            : `${details.runtime}m`)
        : '')
    : (details?.number_of_seasons
        ? `${details.number_of_seasons} season${details.number_of_seasons > 1 ? 's' : ''}`
        : '');
  const movieRuntime = isMovie ? details?.runtime : undefined;
  const movieEnds = movieRuntime != null && movieRuntime > 0 ? endsAtTime(movieRuntime) : null;
  const factLine = [year, runtimeText, movieEnds ? MEDIA_PANEL.endsAt(movieEnds) : ''].filter(Boolean).join(' · ');
  const author = isMovie
    ? details?.credits?.crew?.find(person => person.job === 'Director')?.name
    : details?.created_by?.[0]?.name;
  const genreChips = (details?.genres || []).slice(0, 2);
  const castPeople = (details?.credits?.cast || details?.aggregate_credits?.cast || [])
    .filter((person): person is CreditPerson => !!person?.id && !!person?.name)
    .slice(0, 12);
  const makerPeople = (isMovie
    ? [...new Map(
      (details?.credits?.crew || [])
        .filter((person): person is CreditPerson => person?.job === 'Director' && !!person.id && !!person.name)
        .map(person => [person.id, person] as const),
    ).values()]
    : (details?.created_by || []).filter((person): person is CreditPerson => !!person?.id && !!person?.name)
  ).slice(0, 3);
  const openPerson = (id: number) => {
    onClose();
    router.push(`/(app)/person/${id}` as Href);
  };
  const audienceScore = audienceScoreFromDetails(details);
  const hasWatchOffers = whereToWatch.streaming.length > 0 || whereToWatch.rentBuy.length > 0 || whereToWatch.inCinemas;
  const watchNetworks = isMovie ? [] : networksFromDetails(details);
  const watchRegionName = regionDisplayName(whereToWatch.region);
  const stackProviders = (hasWatchOffers
    ? [...whereToWatch.streaming, ...whereToWatch.rentBuy].map(p => ({ id: `${p.provider_id}-${p.offerType}`, logo: p.logo_path }))
    : watchNetworks.map((network) => ({ id: String(network.providerId), logo: network.logoPath }))
  );
  const stackShown = stackProviders.slice(0, 3);
  const stackExtra = stackProviders.length - stackShown.length;
  const savedRating = watchedEntry?.rating || 0;
  const savedReviewText = watchedEntry?.note || '';
  const statusLabel = statusPending
    || (isWatching ? MEDIA_PANEL.watching
      : watched && watchedEntry?.dnf ? MEDIA_PANEL.didntFinish
      : watched ? MEDIA.watched
      : MEDIA_PANEL.status);
  const consensusLine = criticScore
    ? getConsensusLine(criticScore.criticScore, audienceScore, { audienceVoteCount: details?.vote_count, seed: details?.id })
    : null;

  // Prefer an official Trailer, then Teaser, then any YouTube clip (mirrors web).
  const vids = details?.videos?.results || [];
  const trailer = vids.find(v => v.site === 'YouTube' && v.type === 'Trailer')
    || vids.find(v => v.site === 'YouTube' && v.type === 'Teaser')
    || vids.find(v => v.site === 'YouTube');
  const trailerKey = trailer?.key || null;

  const savedWatchedAt = String(watchedEntry?.watched_at || defaultWatchedAt).slice(0, 10);

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

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1 }}
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          bounces={false}
          keyboardShouldPersistTaps="handled"
        >
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
                {/* Head: poster over the cover band, facts beside it. */}
                <View style={styles.head}>
                  {details?.poster_path
                    ? <Image source={{ uri: posterUrl(details.poster_path, 'w342') ?? '' }} style={styles.poster} />
                    : <View style={styles.poster} />}
                  <View style={styles.headText}>
                    <Text style={styles.kicker}>{isMovie ? MEDIA.movie : MEDIA.series}</Text>
                    <Text style={styles.title}>{title}</Text>
                    {!!factLine && (
                      <Text style={styles.facts}>
                        {factLine}
                        {author ? `\n${author}` : ''}
                      </Text>
                    )}
                    {genreChips.length > 0 && (
                      <View style={styles.genreRow}>
                        {genreChips.map(genre => (
                          <View key={genre.id} style={styles.genreChip}>
                            <Text style={styles.genreChipText}>{genre.name}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.pill, inList ? styles.pillSaved : styles.pillPrimary]}
                    onPress={handleSaveFromPanel}
                    accessibilityRole="button"
                  >
                    {inList ? <IconCheck color={colors.statusWatched} /> : <IconBookmark saved={false} />}
                    <Text style={[styles.pillText, inList ? { color: colors.statusWatched } : { color: colors.onAccentFill }]} numberOfLines={1}>
                      {inList ? MEDIA_PANEL.inWatchlist : MEDIA_PANEL.addToWatchlist}
                    </Text>
                  </TouchableOpacity>

                  <View>
                    <TouchableOpacity
                      style={[styles.pill, isWatching && styles.pillWatching, watched && !isWatching && styles.pillSaved]}
                      onPress={() => setStatusMenuOpen(open => !open)}
                      disabled={!!statusPending}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: statusMenuOpen, disabled: !!statusPending }}
                    >
                      <Text
                        style={[styles.pillText, isWatching && { color: colors.statusWatching }, watched && !isWatching && { color: colors.statusWatched }]}
                        numberOfLines={1}
                      >
                        {statusLabel}
                      </Text>
                    </TouchableOpacity>
                    {statusMenuOpen && (
                      <View style={styles.statusMenu}>
                        {!isMovie && (
                          <TouchableOpacity
                            style={styles.statusOption}
                            onPress={() => runStatusAction(async () => {
                              if (isWatching) {
                                const stopped = await watching.stopWatching(itemId, { undo: true });
                                return stopped ? { ok: true } : { ok: false, error: MEDIA_PANEL.couldNotUpdateWatchStatus };
                              }
                              return moveSavedShowToWatching({
                                startWatching: () => watching.startWatching({ ...details, id: itemId, media_type: 'tv' }),
                                removeFromSaved: () => inList ? watchlist.removeFromList(itemId) : Promise.resolve(true),
                                rollbackWatching: () => watching.stopWatching(itemId),
                              });
                            })}
                          >
                            <Text style={styles.statusOptionText}>{MEDIA_PANEL.watching}</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.statusOption} onPress={() => runStatusAction(() => markWatchedNow(false))}>
                          <Text style={styles.statusOptionText}>{MEDIA.watched}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.statusOption} onPress={() => runStatusAction(() => markWatchedNow(true))}>
                          <Text style={styles.statusOptionText}>{MEDIA_PANEL.didntFinish}</Text>
                        </TouchableOpacity>
                        {(isWatching || watched) && (
                          <TouchableOpacity
                            style={styles.statusOption}
                            onPress={() => runStatusAction(async () => {
                              if (isWatching) {
                                const stopped = await watching.stopWatching(itemId, { undo: true });
                                return stopped ? { ok: true } : { ok: false, error: MEDIA_PANEL.couldNotClearWatchStatus };
                              }
                              const removed = await history.removeEntry(itemId, itemType, { undo: true });
                              return removed ? { ok: true } : { ok: false, error: MEDIA_PANEL.couldNotClearWatchStatus };
                            })}
                          >
                            <Text style={[styles.statusOptionText, { color: colors.textMuted }]}>{MEDIA_PANEL.clearStatus}</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  <View style={styles.iconGroup}>
                    {FAVOURITES_ENABLED && (
                      <TouchableOpacity
                        style={[styles.iconBtn, isFav && styles.iconBtnFav]}
                        onPress={() => favorites.toggleFavorite({ ...details, id: itemId, media_type: itemType })}
                        accessibilityRole="button"
                        accessibilityLabel={isFav ? fw.pastTitle : fw.noun}
                        accessibilityState={{ selected: isFav }}
                      >
                        <IconHeart filled={isFav} />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[styles.iconBtn, isInAnyList && styles.iconBtnOn]}
                      onPress={() => setShowListSheet(true)}
                      accessibilityRole="button"
                      accessibilityLabel={isInAnyList ? MEDIA_PANEL.onList : MEDIA_PANEL.list}
                    >
                      <IconList active={isInAnyList} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.iconBtn} onPress={handleShare} accessibilityRole="button" accessibilityLabel={COMMON.share}>
                      <IconShare />
                    </TouchableOpacity>
                  </View>
                </View>

                {!isMovie && details && (inList || isWatching) && (
                  <EpisodeAlertsCard show={details} />
                )}

                {!isMovie && isWatching && details && (
                  <UpNextCard
                    tvId={itemId}
                    details={details}
                    progress={progress}
                    whereToWatch={whereToWatch}
                    onSeriesFinished={handleSeriesFinished}
                  />
                )}

                {details && (
                  <View style={styles.watchCard}>
                    <TouchableOpacity
                      style={styles.watchHead}
                      onPress={() => setWatchOpen(open => !open)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: watchOpen }}
                    >
                      <Text style={styles.watchTitle}>{MEDIA_PANEL.whereToWatch}</Text>
                      {!watchOpen && stackShown.length > 0 && (
                        <View style={styles.logoStack}>
                          {stackShown.map((provider, index) => (
                            <Image
                              key={provider.id}
                              source={{ uri: provider.logo?.startsWith('http') ? provider.logo : (logoUrl(provider.logo, 'w45') ?? '') }}
                              style={[styles.logoMark, index > 0 && { marginLeft: -10 }]}
                              resizeMode="contain"
                            />
                          ))}
                          {stackExtra > 0 && (
                            <View style={[styles.logoMore, { marginLeft: -10 }]}>
                              <Text style={styles.logoMoreText}>{MEDIA_PANEL.moreProviders(stackExtra)}</Text>
                            </View>
                          )}
                        </View>
                      )}
                      <IconChevron dir={watchOpen ? 'up' : 'down'} />
                    </TouchableOpacity>
                    {watchOpen && (
                      <View>
                        {hasWatchOffers && !!watchRegionName && (
                          <Text style={styles.watchRegion}>{MEDIA_PANEL.offersIn(watchRegionName)}</Text>
                        )}
                        {whereToWatch.inCinemas && (
                          <View style={[styles.providerChip, styles.providerChipCinema]}>
                            <Text style={[styles.providerName, { color: colors.accent, maxWidth: undefined }]}>In Cinemas</Text>
                          </View>
                        )}
                        {whereToWatch.streaming.length > 0 && (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
                            {whereToWatch.streaming.map(p => (
                              <TouchableOpacity key={`${p.provider_id}-${p.offerType}`} style={styles.providerChip} activeOpacity={0.7} onPress={() => openWatchLink(p)}>
                                {p.logo_path && <Image source={{ uri: p.logo_path.startsWith('http') ? p.logo_path : (logoUrl(p.logo_path, 'w45') ?? '') }} style={styles.providerLogo} resizeMode="contain" />}
                                <Text style={styles.providerName} numberOfLines={1}>{p.provider_name}</Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                        {whereToWatch.rentBuy.length > 0 && (
                          <>
                            {whereToWatch.streaming.length > 0 && <Text style={styles.providerSublabel}>Rent or Buy</Text>}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingBottom: spacing.md }}>
                              {whereToWatch.rentBuy.map(p => (
                                <TouchableOpacity key={`${p.provider_id}-${p.offerType}`} style={[styles.providerChip, styles.providerChipRentBuy]} activeOpacity={0.7} onPress={() => openWatchLink(p)}>
                                  {p.logo_path && <Image source={{ uri: p.logo_path.startsWith('http') ? p.logo_path : (logoUrl(p.logo_path, 'w45') ?? '') }} style={styles.providerLogo} resizeMode="contain" />}
                                  <Text style={styles.providerName} numberOfLines={1}>{p.provider_name}</Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          </>
                        )}
                        {!hasWatchOffers && (
                          <>
                            {watchNetworks.length > 0 && (
                              <View style={styles.networkRow}>
                                {watchNetworks.map((network) => (
                                  <Image
                                    key={network.providerId}
                                    source={{ uri: network.logoPath?.startsWith('http') ? network.logoPath : (logoUrl(network.logoPath, 'w45') ?? '') }}
                                    style={styles.networkLogo}
                                    resizeMode="contain"
                                    accessibilityLabel={network.providerName}
                                  />
                                ))}
                              </View>
                            )}
                            <Text style={styles.providersEmpty}>
                              {watchRegionName ? `Not streaming in ${watchRegionName} yet.` : 'Not streaming anywhere yet.'}
                            </Text>
                          </>
                        )}
                        {hasWatchOffers && (
                          <Text style={styles.providersAttribution}>
                            Streaming availability by JustWatch.
                            {[...whereToWatch.streaming, ...whereToWatch.rentBuy].some(p =>
                              buildWatchLink({ providerUrl: p.providerUrl, justwatchLink: whereToWatch.justwatchLink })?.kind === 'provider'
                            ) ? ' Links open the verified title offer.' : ''}
                          </Text>
                        )}
                      </View>
                    )}
                  </View>
                )}

                {/* Free: streaming alerts for a film on the watchlist. The watchlist is
                    the opt-in, so this is only a way to mute it (mirrors web). */}
                {isMovie && details && inList && <StreamingAlertsCard movie={details} />}

                {(criticScore || Number.isFinite(audienceScore)) && (
                  <View style={styles.scoresRow}>
                    {criticScore && (
                      <View>
                        <Text style={styles.scoreValue}>{criticScore.criticScore}%</Text>
                        <Text style={styles.scoreLabel}>{MEDIA_PANEL.critics}</Text>
                      </View>
                    )}
                    {criticScore && Number.isFinite(audienceScore) && <View style={styles.scoreRule} />}
                    {Number.isFinite(audienceScore) && (
                      <View>
                        <Text style={styles.scoreValue}>{audienceScore}%</Text>
                        <Text style={styles.scoreLabel}>{MEDIA_PANEL.audience}</Text>
                      </View>
                    )}
                    {audienceQuote ? (
                      <View style={styles.audienceQuote}>
                        <Text style={styles.audienceQuoteText} numberOfLines={3}>&ldquo;{audienceQuote.text}&rdquo;</Text>
                        <Text style={styles.audienceQuoteAttr}>{audienceQuote.author || 'A TMDB audience review'}</Text>
                      </View>
                    ) : consensusLine ? (
                      <Text style={styles.consensusLine}>{consensusLine}</Text>
                    ) : null}
                  </View>
                )}

                {details?.overview ? <Text style={styles.overview}>{details.overview}</Text> : null}

                {castPeople.length > 0 && (
                  <View>
                    <Text style={styles.sectionTitle}>Cast</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.md }}>
                      {castPeople.map(person => (
                        <CastFollowCard
                          key={person.id}
                          person={person}
                          following={followPerson.isFollowing(person.id)}
                          busy={followPerson.busyId === person.id}
                          showFollow={followPerson.signedIn}
                          onOpen={() => openPerson(person.id)}
                          onToggle={() => followPerson.toggle(person)}
                        />
                      ))}
                    </ScrollView>
                  </View>
                )}

                {makerPeople.length > 0 && (
                  <View>
                    <Text style={styles.sectionTitle}>{isMovie ? PEOPLE.directedBy : PEOPLE.createdBy}</Text>
                    <View style={{ gap: spacing.md }}>
                      {makerPeople.map(person => (
                        <CrewFollowRow
                          key={person.id}
                          person={person}
                          roleLabel={isMovie ? PEOPLE.director : PEOPLE.creator}
                          following={followPerson.isFollowing(person.id)}
                          busy={followPerson.busyId === person.id}
                          showFollow={followPerson.signedIn}
                          onOpen={() => openPerson(person.id)}
                          onToggle={() => followPerson.toggle(person)}
                        />
                      ))}
                    </View>
                  </View>
                )}

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

                {/* Episode guide */}
                {!isMovie && details && (
                  <>
                    <Text style={styles.sectionTitle}>Episodes</Text>
                    <EpisodeGuide
                      tvId={itemId}
                      progress={progress}
                      details={details}
                      watching={watching}
                      onSeriesFinished={handleSeriesFinished}
                    />
                  </>
                )}

                {SHOW_WATCH_TOGETHER && (
                  <SavedByToo tmdbId={itemId} mediaType={isMovie ? 'movie' : 'tv'} />
                )}

                {/* Recommendations and the franchise card close the panel, matching
                    web: everything above is about this title, these are where to
                    go next. */}
                {similar.length > 0 && (
                  <>
                    <Text style={styles.sectionTitle}>{MEDIA_PANEL.moreLikeThis}</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm + 2, paddingBottom: spacing.xs }}>
                      {similar.map((item: any) => {
                        const type = mediaTypeFromItem(item);
                        const year = releaseDateFromItem(item)?.slice(0, 4) || '';
                        return (
                          <TouchableOpacity key={`${type}-${item.id}`} style={styles.similarCard} activeOpacity={0.7} onPress={() => openTitle(item.id, type)} accessibilityRole="button" accessibilityLabel={titleFromItem(item)}>
                            <Image source={{ uri: posterUrl(item.poster_path, 'w185') ?? '' }} style={styles.similarPoster} />
                            <Text style={styles.similarName} numberOfLines={1}>{titleFromItem(item)}</Text>
                            <Text style={styles.similarMeta} numberOfLines={1}>{[year, type === 'tv' ? 'TV' : 'Movie'].filter(Boolean).join(' · ')}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </>
                )}

                {isMovie && details && <CollectionCard details={details} itemId={itemId} />}
              </>
            )}
          </View>
        </ScrollView>

        {!loading && !error && details && (
          <TitleFootBar
            key={`${itemType}:${itemId}`}
            itemId={itemId}
            itemType={itemType}
            title={title}
            watched={watched}
            dnf={!!watchedEntry?.dnf}
            rating={savedRating}
            review={savedReviewText}
            watchedAt={savedWatchedAt}
            isTv={!isMovie}
            isWatching={isWatching}
            busy={footBusy || !!statusPending}
            isPublicProfile={!!profile?.is_public}
            hasUser={!!userId}
            privateNotes={privateNotes}
            onMarkWatched={footMarkWatched}
            onStartWatching={footStartWatching}
            onUndoWatched={footUndoWatched}
            onRate={async (value) => !!await history.updateEntry(itemId, { rating: value || null, note: savedReviewText || null, dnf: !!watchedEntry?.dnf, watched_at: savedWatchedAt }, itemType)}
            onSaveReview={async ({ note, watchedAt }) => !!await history.updateEntry(itemId, { rating: savedRating || null, note, dnf: !!watchedEntry?.dnf, watched_at: watchedAt }, itemType)}
          />
        )}

        </KeyboardAvoidingView>
      </Animated.View>
      <UndoToast placement="panel" />
      <NoticeToast placement="panel" />
    </Modal>

    {showListSheet && details && (
      <AddToListSheet
        item={{ id: itemId, media_type: itemType, title, poster_path: details?.poster_path ?? null }}
        customLists={customLists}
        topLists={topLists}
        onClose={() => setShowListSheet(false)}
      />
    )}
    {followPerson.sheet}
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

  backdropWrap: { height: 148, position: 'relative' },
  backdropGradient: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.25)' },
  closeBtn: {
    position: 'absolute', top: spacing.lg, right: spacing.lg,
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center', justifyContent: 'center',
  },

  body: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },


  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg, marginBottom: spacing.lg },
  poster: {
    width: 112, height: 168, marginTop: -36, borderRadius: radii.md,
    backgroundColor: colors.surfaceSunken, zIndex: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
  },
  headText: { flex: 1, minWidth: 0, paddingTop: spacing.md },
  kicker: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.accent, marginBottom: 4 },
  title: { fontFamily: fontFamily.display, fontSize: 24, letterSpacing: -0.6, color: colors.textPrimary, lineHeight: 26, marginBottom: 4 },
  facts: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  genreChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.badge, backgroundColor: colors.accentSecondaryFill },
  genreChipText: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.onAccentSecondaryFill },
  scoresRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingBottom: spacing.lg, marginBottom: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  scoreValue: { fontFamily: fontFamily.display, fontSize: 22, color: colors.textPrimary, lineHeight: 24 },
  scoreLabel: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted, marginTop: 2 },
  scoreRule: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: colors.border },
  consensusLine: { flex: 1, minWidth: 0, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, lineHeight: 17 },
  overview: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20, marginBottom: spacing.lg },
  audienceQuote: { flex: 1, minWidth: 0, borderLeftWidth: 2, borderLeftColor: colors.accent, paddingLeft: spacing.md },
  audienceQuoteText: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 21 },
  audienceQuoteAttr: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.textMuted, marginTop: 4, letterSpacing: 0.3 },

  // Single-source spacing.sm rhythm for the action block: the col gap handles
  // Save↔row1 and its marginBottom handles row1↔watching-row. Rows carry no
  // margin of their own, so nothing can stack into an uneven gap. The section
  // below spaces itself (sectionTitle marginTop).
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    minHeight: 38, paddingHorizontal: spacing.lg,
    borderRadius: radii.pill, backgroundColor: colors.surfaceSunken,
  },
  pillPrimary: { backgroundColor: colors.accentFill },
  pillSaved: { backgroundColor: colors.statusWatchedDim },
  pillWatching: { backgroundColor: colors.statusWatchingDim },
  pillText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary, maxWidth: 128 },
  iconGroup: { flexDirection: 'row', gap: spacing.sm, marginLeft: 'auto' },
  iconBtn: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceSunken,
  },
  iconBtnFav: { backgroundColor: colors.accentDim },
  iconBtnOn: { backgroundColor: colors.statusWatchingDim },
  statusMenu: {
    position: 'absolute', top: 44, left: 0, zIndex: 5, minWidth: 160,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 8,
  },
  statusOption: { paddingVertical: 12, paddingHorizontal: spacing.lg },
  statusOptionText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  upNextCard: { backgroundColor: colors.surfaceSunken, borderRadius: radii.lg, padding: spacing.lg, marginBottom: spacing.lg },
  upNextTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary, marginBottom: spacing.md },
  upNextRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  upNextStill: { width: 96, height: 56, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surface },
  upNextKicker: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted, marginBottom: 2 },
  upNextName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  upNextWhere: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, marginTop: 2 },
  upNextBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.accentFill,
  },
  upNextBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.onAccentFill },
  upNextTrack: { height: 5, borderRadius: radii.pill, backgroundColor: colors.border, marginTop: spacing.md, overflow: 'hidden' },
  upNextLeft: { marginTop: spacing.sm, fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted },
  upNextFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.statusWatching },
  watchCard: { marginBottom: spacing.lg },
  watchHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 44 },
  watchTitle: { flex: 1, fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  logoStack: { flexDirection: 'row', alignItems: 'center' },
  logoMark: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.surfaceSunken,
    backgroundColor: colors.surfaceRaised,
  },
  logoMore: {
    width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: colors.surfaceSunken,
    backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center',
  },
  logoMoreText: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.textSecondary },
  watchRegion: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, marginBottom: spacing.sm },
  networkRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  networkLogo: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surfaceRaised },
  // btnSecondary is flex:1 for row use; btnPrimary is not, so it needs this to
  // share a row evenly. btnStandalone undoes the flex when one sits alone in a
  // column, where flex:1 would stretch it to the container's height.
  btnHalf: { flex: 1 },
  btnStandalone: { flex: 0, marginBottom: spacing.sm },

  btnPrimary: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  btnSaved:    { backgroundColor: colors.statusWatchedDim, borderWidth: 1.5, borderColor: `${colors.statusWatched}33` },
  btnPrimaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: '#fff' },

  btnSecondary: {
    // 10.5 + 1.5 border = 12 per side, so secondary rows match btnPrimary's height exactly
    flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radii.md,
    paddingVertical: 10.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
  },
  btnSecondaryActive: { borderColor: `${colors.accent}66`, backgroundColor: colors.accentDim },
  btnWatching:        { borderColor: `${colors.statusWatching}73`, backgroundColor: colors.statusWatchingDim },
  btnSecondaryText:   { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textSecondary },

  similarCard: { width: 76 },
  similarPoster: { width: 76, aspectRatio: 2 / 3, borderRadius: radii.md, backgroundColor: colors.surfaceRaised },
  similarName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary, marginTop: 6 },
  similarMeta: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted, marginTop: 1 },

  sectionTitle: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: spacing.lg, marginBottom: spacing.md },

  // Same pill as the Didn't finish chip beside it: pill radius, 1.5 border,
  // small bold uppercase-ish label. They sit in the same block, so matching
  // them stops the review area reading as two different control languages.
  // The inline picker reports no intrinsic width to flexbox, so it needs one
  // to centre against; 320 is the widest the iOS calendar grid draws.


  providerChip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.border },
  providerChipCinema: { alignSelf: 'flex-start', backgroundColor: colors.accentDim, borderColor: colors.accent + '66', marginBottom: spacing.md },
  providerChipRentBuy: { opacity: 0.8 },
  providerLogo: { width: 24, height: 24, borderRadius: 6 },
  providerName: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary, maxWidth: 90 },
  providerOffer: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },
  providersEmpty: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 18 },
  providersAttribution: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, marginBottom: spacing.md, lineHeight: 15 },
  providerSublabel: { fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.sm },
  // Trailer card — 16:9 backdrop with a play affordance; opens YouTube on tap.
  trailerCard: { height: (SCREEN_W - spacing.xl * 2) * 9 / 16, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, marginBottom: spacing.sm },
  trailerPlayer: { height: (SCREEN_W - spacing.xl * 2) * 9 / 16, borderRadius: radii.md, overflow: 'hidden', backgroundColor: '#000', marginTop: spacing.md, marginBottom: spacing.sm },
  trailerScrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  trailerPlayBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' },
  trailerLabel: { position: 'absolute', bottom: spacing.md, fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, letterSpacing: 0.5, textTransform: 'uppercase', color: '#fff' },

  epRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingLeft: spacing.sm, paddingRight: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: spacing.md },
  epRowCurrent: { backgroundColor: colors.accentDim },
  epRowWatched: { opacity: 0.45 },
  epActionError: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.danger, marginBottom: spacing.sm },
  epCode:        { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.chipEpisode, letterSpacing: 0.4 },
  epCodeCurrent: { color: colors.accent },
  epAirDate:   { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },
  upNextPill:  { backgroundColor: colors.accent, borderRadius: radii.pill, paddingHorizontal: 6, paddingVertical: 2 },
  upNextText:  { fontFamily: fontFamily.sansBold, fontSize: 9, color: '#fff', letterSpacing: 0.6 },
  epTitle:     { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  epTitleCurrent: { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  epTitleWatched: { color: colors.textMuted },

  seasonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  seasonPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    minHeight: 34, paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken,
  },
  seasonPillText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  seasonMenu: {
    position: 'absolute', top: 40, left: 0, zIndex: 4, minWidth: 160, maxHeight: 240,
    backgroundColor: colors.surface, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  seasonMenuItem: { paddingVertical: 10, paddingHorizontal: spacing.md },
  seasonMenuText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  seasonBulkLink: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.accentText },

  seasonBulk: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
  },
  seasonBulkInfo: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexShrink: 1 },
  seasonBulkTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary },
  seasonBulkCount: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  seasonBulkBtn: {
    minHeight: 44, // keeps the bulk action a comfortable touch target
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.badge,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  seasonBulkBtnText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary },
  seasonBulkBtnTextPending: { color: colors.textMuted },

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
  lsTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: spacing.md },
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
