import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  episodeAt,
  episodeRatingSeasonNumbers,
  episodeRatingStory,
  episodeRatingSummary,
  episodeRowCount,
  formatEpisodeScore,
  formatVoteCount,
  gridForSource,
  ratingBand,
} from '@plot/core/episodeRatings.js';
import { useEpisodeRatings } from '@plot/core/useEpisodeRatings.js';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { fontFamily, fontSize, spacing, radii, type Palette } from '../lib/tokens';

const BANDS = [
  ['peak', MEDIA_PANEL.episodeRatingsBandPeak],
  ['good', MEDIA_PANEL.episodeRatingsBandGood],
  ['fine', MEDIA_PANEL.episodeRatingsBandFine],
  ['soft', MEDIA_PANEL.episodeRatingsBandSoft],
  ['fall', MEDIA_PANEL.episodeRatingsBandFall],
] as const;

function channel(hex: string, start: number) {
  return parseInt(hex.slice(start, start + 2), 16);
}

function parseColor(input: string): [number, number, number] | null {
  const value = input.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) {
    const hex = short[1];
    return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
  }
  const full = /^#([0-9a-f]{6})$/i.exec(value);
  if (!full) return null;
  return [channel(full[1], 0), channel(full[1], 2), channel(full[1], 4)];
}

/** Same mix the web sheet writes with color-mix. Weight is the first color's share. */
function mixHex(base: string, withColor: string, weight: number) {
  const from = parseColor(base);
  const to = parseColor(withColor);
  if (!from || !to) return base;
  const share = weight / 100;
  const mixed = from.map((part, index) => Math.round(part * share + to[index] * (1 - share)));
  return `#${mixed.map(part => part.toString(16).padStart(2, '0')).join('')}`;
}

function bandColors(colors: Palette) {
  const ink = colors.textPrimary;
  return {
    peak: { backgroundColor: colors.accentSecondaryFill, color: colors.onAccentSecondaryFill },
    good: { backgroundColor: mixHex(colors.accentSecondaryFill, colors.surface, 58), color: ink },
    fine: { backgroundColor: colors.surfaceSunken, color: ink },
    soft: { backgroundColor: mixHex(colors.danger, colors.surface, 16), color: ink },
    fall: { backgroundColor: mixHex(colors.danger, colors.surface, 34), color: ink },
    empty: { backgroundColor: 'transparent', color: ink },
  };
}

type RatingsDetails = { seasons?: Array<{ season_number?: number | null; episode_count?: number | null }> } | null;
type RatingEpisode = { episodeNumber: number; name: string; score: number | null; voteCount: number | null };
type RatingSeason = { seasonNumber: number; episodes: RatingEpisode[] };

function EpisodeRatingsSheet({ tvId, details, onClose }: { tvId: number; details: RatingsDetails; onClose: () => void }) {
  const { colors } = useTheme();
  const { userId } = useAppData();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const tones = useMemo(() => bandColors(colors), [colors]);
  const data = useEpisodeRatings({ tvId, details, userId, enabled: true });
  const [source, setSource] = useState<'tmdb' | 'yours'>('tmdb');
  const [picked, setPicked] = useState<{ seasonNumber: number; episodeNumber: number } | null>(null);

  const ready = data.status === 'ready';
  const grid = gridForSource(data.grid, data.yours, source) as RatingSeason[];
  const story = episodeRatingStory(grid);
  const summary = episodeRatingSummary(story, source);
  const signedOutYours = source === 'yours' && !userId;
  const showGrid = ready && !signedOutYours && story.kind !== 'empty';
  const chosen = picked && episodeAt(grid, picked.seasonNumber, picked.episodeNumber) ? picked : story.low;
  const selected = showGrid && chosen ? episodeAt(grid, chosen.seasonNumber, chosen.episodeNumber) : null;
  const rows = episodeRowCount(grid);
  const votes = selected && source === 'tmdb' ? formatVoteCount(selected.voteCount) : '';

  let message: string | null = null;
  if (data.status === 'error') message = MEDIA_PANEL.episodeRatingsLoadError;
  else if (ready && signedOutYours) message = MEDIA_PANEL.episodeRatingsSignIn;
  else if (ready && story.kind === 'empty') {
    message = source === 'yours' ? MEDIA_PANEL.episodeRatingsNoneYours : MEDIA_PANEL.episodeRatingsNoneTmdb;
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1} />
      <View style={[styles.sheet, { height: height * 0.88, paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.handle} />
        <View style={styles.head}>
          <Text style={styles.title}>{MEDIA_PANEL.episodeRatingsTitle}</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.close}>{MEDIA_PANEL.episodeRatingsClose}</Text>
          </TouchableOpacity>
        </View>

        {data.status === 'loading' || data.status === 'idle' ? (
          <ActivityIndicator color={colors.accent} style={styles.loading} />
        ) : (
          <>
            <View style={styles.sources}>
              {([['tmdb', MEDIA_PANEL.episodeRatingsTmdb], ['yours', MEDIA_PANEL.episodeRatingsYours]] as const).map(([id, label]) => {
                const on = source === id;
                return (
                  <TouchableOpacity
                    key={id}
                    style={[styles.source, on && styles.sourceOn]}
                    onPress={() => setSource(id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.sourceText, on && styles.sourceTextOn]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {message && (
              <View>
                <Text style={styles.message}>{message}</Text>
                {data.status === 'error' && (
                  <TouchableOpacity onPress={data.reload} accessibilityRole="button">
                    <Text style={styles.retry}>{MEDIA_PANEL.episodeRatingsRetry}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            {showGrid && (
              <>
                <Text style={styles.story}>{summary.story}</Text>
                {summary.rated ? <Text style={styles.rated}>{summary.rated}</Text> : null}
                <View style={styles.legend}>
                  {BANDS.map(([band, label]) => (
                    <View key={band} style={styles.legendItem}>
                      <View style={[styles.swatch, { backgroundColor: tones[band].backgroundColor }]} />
                      <Text style={styles.legendText}>{label}</Text>
                    </View>
                  ))}
                </View>
                <ScrollView style={styles.gridScroll}>
                  <View style={[styles.gridRow, { height: 25 + rows * 39 }]}>
                  <View>
                    <View style={styles.headSpacer} />
                    {Array.from({ length: rows }, (_, index) => (
                      <View key={index + 1} style={styles.labelCell}>
                        <Text style={styles.labelText}>{`E${index + 1}`}</Text>
                      </View>
                    ))}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled style={{ height: 25 + rows * 39 }}>
                    <View>
                      <View style={styles.line}>
                        {grid.map(season => (
                          <View key={season.seasonNumber} style={styles.headCell}>
                            <Text style={styles.labelText}>{`S${season.seasonNumber}`}</Text>
                          </View>
                        ))}
                      </View>
                      {Array.from({ length: rows }, (_, index) => {
                        const episodeNumber = index + 1;
                        return (
                          <View key={episodeNumber} style={styles.line}>
                            {grid.map(season => {
                              const episode = season.episodes.find(item => item.episodeNumber === episodeNumber);
                              if (!episode) return <View key={season.seasonNumber} style={styles.gap} />;
                              const band = ratingBand(episode.score) as keyof ReturnType<typeof bandColors>;
                              const tone = tones[band];
                              const on = chosen?.seasonNumber === season.seasonNumber && chosen?.episodeNumber === episodeNumber;
                              const score = episode.score == null ? '' : formatEpisodeScore(episode.score, source);
                              const name = episode.name || MEDIA_PANEL.episodeRatingsEpisode(episodeNumber);
                              return (
                                <TouchableOpacity
                                  key={season.seasonNumber}
                                  style={[
                                    styles.cell,
                                    { backgroundColor: tone.backgroundColor, borderColor: on ? colors.textPrimary : band === 'empty' ? colors.borderStrong : 'transparent' },
                                  ]}
                                  onPress={() => setPicked({ seasonNumber: season.seasonNumber, episodeNumber })}
                                  accessibilityRole="button"
                                  accessibilityState={{ selected: on }}
                                  accessibilityLabel={MEDIA_PANEL.episodeRatingsCell(
                                    season.seasonNumber,
                                    episodeNumber,
                                    name,
                                    score || MEDIA_PANEL.episodeRatingsUnrated,
                                  )}
                                >
                                  <Text style={[styles.cellText, { color: tone.color }]}>{score}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                  </View>
                </ScrollView>
                {selected && chosen && (
                  <View style={styles.detail}>
                    <View style={styles.detailCopy}>
                      <Text style={styles.detailId}>{MEDIA_PANEL.seasonEpisode(chosen.seasonNumber, chosen.episodeNumber)}</Text>
                      <Text style={styles.detailName} numberOfLines={1}>
                        {selected.name || MEDIA_PANEL.episodeRatingsEpisode(selected.episodeNumber)}
                      </Text>
                      {votes ? <Text style={styles.detailVotes}>{MEDIA_PANEL.episodeRatingsVotes(votes)}</Text> : null}
                    </View>
                    <Text style={[styles.detailScore, selected.score == null && styles.detailUnrated]}>
                      {selected.score == null ? MEDIA_PANEL.episodeRatingsUnrated : formatEpisodeScore(selected.score, source)}
                    </Text>
                  </View>
                )}
              </>
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

export function EpisodeRatingsEntry({ tvId, details }: { tvId: number; details: RatingsDetails }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (episodeRatingSeasonNumbers(details).length === 0) return null;
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} accessibilityRole="button" style={styles.open}>
        <Text style={styles.openText}>{MEDIA_PANEL.episodeRatingsTitle}</Text>
      </TouchableOpacity>
      {open && <EpisodeRatingsSheet tvId={tvId} details={details} onClose={close} />}
    </>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    open: { alignSelf: 'flex-start', marginBottom: spacing.sm },
    openText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.accentText },
    overlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.surface,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.borderStrong,
      marginBottom: spacing.md,
    },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      marginBottom: spacing.md,
    },
    title: { flex: 1, fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
    close: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accentText },
    loading: { marginTop: spacing.xxl },
    sources: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    source: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceRaised,
      borderRadius: 999,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
    },
    sourceOn: { backgroundColor: colors.textPrimary, borderColor: colors.textPrimary },
    sourceText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary },
    sourceTextOn: { color: colors.bg },
    message: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textSecondary, lineHeight: 22 },
    retry: { marginTop: spacing.sm, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.accentText },
    story: {
      fontFamily: fontFamily.display,
      fontSize: fontSize.lg,
      color: colors.textPrimary,
      lineHeight: 24,
      marginBottom: spacing.xs,
    },
    rated: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.sm },
    legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    swatch: { width: 10, height: 10, borderRadius: 3 },
    legendText: {
      fontFamily: fontFamily.sansBold,
      fontSize: fontSize.xs,
      color: colors.textMuted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    gridScroll: { flex: 1 },
    gridRow: { flexDirection: 'row' },
    line: { flexDirection: 'row', gap: 3, marginBottom: 3 },
    headSpacer: { height: 22, marginBottom: 3 },
    headCell: { width: 42, height: 22, alignItems: 'center', justifyContent: 'center' },
    labelCell: { width: 28, height: 36, marginBottom: 3, justifyContent: 'center' },
    labelText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textMuted },
    cell: {
      width: 42,
      height: 36,
      borderRadius: 6,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellText: { fontFamily: fontFamily.sansTabularBold, fontSize: fontSize.xs },
    gap: { width: 42, height: 36 },
    detail: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    detailCopy: { flex: 1 },
    detailId: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textMuted },
    detailName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
    detailVotes: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
    detailScore: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary },
    detailUnrated: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textMuted },
  });
}
