import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, Alert, ActivityIndicator, StyleSheet, FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Line } from 'react-native-svg';
import { supabase } from '../lib/supabase';
import { tmdb } from '../lib/tmdb';
import { parsePlatform, watchedAtFor, type ParsedImportEntry } from '@plot/core/importParsing.js';
import { dedupeEntries } from '@plot/core/importDedup.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

// Narrower than core's ImportPlatform: mobile offers no Letterboxd upload.
type Platform = 'netflix' | 'prime' | 'disney' | 'max' | 'apple';

// ── Platform config ───────────────────────────────────────────────────

const PLATFORMS: { id: Platform; name: string; color: string; hint: string; accept: string[] }[] = [
  {
    id: 'netflix',
    name: 'Netflix',
    color: '#E50914',
    hint: 'Account → Viewing Activity → Download all → NetflixViewingHistory.csv',
    accept: ['text/csv', 'application/csv', 'text/plain', 'public.comma-separated-values-text'],
  },
  {
    id: 'prime',
    name: 'Amazon Prime',
    color: '#00A8E0',
    hint: 'Account → Data & Privacy → Request data → Digital content → PrimeVideo.WatchedContent.csv',
    accept: ['text/csv', 'application/csv', 'text/plain', 'public.comma-separated-values-text'],
  },
  {
    id: 'disney',
    name: 'Disney+',
    color: '#113CCF',
    hint: 'privacy.disneyplus.com → Request your data → WatchHistory.json',
    accept: ['application/json', 'text/plain', 'public.json'],
  },
  {
    id: 'max',
    name: 'Max (HBO)',
    color: '#6B2D8B',
    hint: 'privacycenter.max.com → Download your data → MaxViewingHistory.csv (or .json)',
    accept: ['text/csv', 'application/csv', 'text/plain', 'application/json', 'public.comma-separated-values-text', 'public.json'],
  },
  {
    id: 'apple',
    name: 'Apple TV+',
    color: '#1C1C1E',
    hint: 'privacy.apple.com → Request data → Apple TV & Purchases → extract PlayActivity.json from the ZIP',
    accept: ['application/json', 'text/plain', 'public.json'],
  },
];

// ── Types ─────────────────────────────────────────────────────────────

interface ResolvedEntry {
  raw: ParsedImportEntry;
  // Normalised once at resolve time via core's watchedAtFor — the source
  // export's date column is optional, so raw.date can be null.
  watchedAt: string;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  alreadyImported: boolean;
}

type Step = 'pick-platform' | 'pick-file' | 'resolving' | 'preview' | 'importing' | 'done';

// ── Helpers ───────────────────────────────────────────────────────────

async function resolveEntries(
  entries: ParsedImportEntry[],
  existingWatches: Set<string>,
  onProgress: (done: number) => void,
): Promise<ResolvedEntry[]> {
  const resolved: ResolvedEntry[] = [];
  const BATCH = 4; // concurrent TMDB searches per tick

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const results = await Promise.all(batch.map(async (e) => {
      const hint = e.hint === 'unknown' ? undefined : e.hint;
      const data = await tmdb.search(e.title);
      const candidates = (data?.results ?? []) as any[];
      // Prefer hint type, then take first result of any type
      const match = hint
        ? (candidates.find((r: any) => r.media_type === hint) ?? candidates.find((r: any) => r.media_type === 'movie' || r.media_type === 'tv'))
        : candidates.find((r: any) => r.media_type === 'movie' || r.media_type === 'tv');
      if (!match) return null;
      const watchedAt = watchedAtFor(e);
      return {
        raw: e,
        watchedAt,
        tmdbId: match.id as number,
        mediaType: match.media_type as 'movie' | 'tv',
        title: (match.title ?? match.name ?? e.title) as string,
        posterPath: (match.poster_path ?? null) as string | null,
        // Only skip an exact (title, date) match already in the history —
        // a rewatch on a different date is a new entry, not a duplicate.
        alreadyImported: existingWatches.has(`${match.id}::${watchedAt}`),
      } satisfies ResolvedEntry;
    }));
    resolved.push(...results.filter((r): r is ResolvedEntry => r !== null));
    onProgress(Math.min(i + BATCH, entries.length));
    // Small rate-limit pause between batches
    if (i + BATCH < entries.length) await new Promise(res => setTimeout(res, 250));
  }
  return resolved;
}

// ── Main modal ────────────────────────────────────────────────────────

interface Props {
  userId: string;
  onClose: () => void;
}

export default function ImportHistoryModal({ userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [step,         setStep]         = useState<Step>('pick-platform');
  const [platform,     setPlatform]     = useState<Platform | null>(null);
  const [rawEntries,   setRawEntries]   = useState<ParsedImportEntry[]>([]);
  const [resolved,     setResolved]     = useState<ResolvedEntry[]>([]);
  const [resolveTotal, setResolveTotal] = useState(0);
  const [resolveDone,  setResolveDone]  = useState(0);
  const [importDone,   setImportDone]   = useState(0);
  const [importTotal,  setImportTotal]  = useState(0);

  const handleSelectPlatform = (p: Platform) => {
    setPlatform(p);
    setStep('pick-file');
  };

  const handlePickFile = useCallback(async () => {
    if (!platform) return;
    const cfg = PLATFORMS.find(p => p.id === platform)!;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: cfg.accept,
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const uri = result.assets[0].uri;
      const text = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });

      const raw = parsePlatform(platform, text);
      if (raw.length === 0) {
        Alert.alert('No entries found', 'The file could not be parsed or contains no viewing history. Make sure you selected the right platform and file.');
        return;
      }
      const deduped = dedupeEntries(raw);
      setRawEntries(deduped);
      setResolveTotal(deduped.length);
      setResolveDone(0);
      setStep('resolving');

      // Fetch existing (tmdb_id, watched_at) pairs to flag exact duplicates —
      // a different date for a title already in the history is a rewatch,
      // not a duplicate, so it must still import.
      const { data: existing } = await supabase
        .from('history')
        .select('tmdb_id, watched_at')
        .eq('user_id', userId);
      const existingWatches = new Set<string>((existing ?? []).map((r: any) => `${r.tmdb_id}::${r.watched_at}`));

      const results = await resolveEntries(deduped, existingWatches, (done) => setResolveDone(done));
      setResolved(results);
      setStep('preview');
    } catch (err) {
      Alert.alert('Error', 'Could not read the file. Please try again.');
      setStep('pick-file');
    }
  }, [platform, userId]);

  const handleImport = useCallback(async () => {
    let toImport = resolved.filter(r => !r.alreadyImported);
    if (toImport.length === 0) {
      setStep('done');
      return;
    }

    const { data: profile } = await supabase.from('profiles').select('log_rewatches').eq('id', userId).maybeSingle();
    const logRewatches = profile?.log_rewatches ?? true;

    if (!logRewatches) {
      // Collapse to one row per title (most-recent watch) — this preference
      // means "don't clutter my history with rewatches" — and clear out any
      // existing rows for those titles first since there's no more DB-level
      // unique(user_id,tmdb_id) to upsert against.
      const latestByTmdbId = new Map<number, ResolvedEntry>();
      for (const r of toImport) {
        const existing = latestByTmdbId.get(r.tmdbId);
        if (!existing || r.watchedAt > existing.watchedAt) latestByTmdbId.set(r.tmdbId, r);
      }
      toImport = Array.from(latestByTmdbId.values());
      await supabase.from('history').delete().eq('user_id', userId).in('tmdb_id', toImport.map(r => r.tmdbId));
    }

    setImportTotal(toImport.length);
    setImportDone(0);
    setStep('importing');

    const BATCH = 50;
    for (let i = 0; i < toImport.length; i += BATCH) {
      const batch = toImport.slice(i, i + BATCH);
      const rows = batch.map(r => ({
        user_id:    userId,
        tmdb_id:    r.tmdbId,
        media_type: r.mediaType,
        title:      r.title,
        poster_path: r.posterPath,
        watched_at: r.watchedAt,
      }));
      if (logRewatches) {
        await supabase.from('history').upsert(rows, { onConflict: 'user_id,tmdb_id,watched_at', ignoreDuplicates: true });
      } else {
        await supabase.from('history').insert(rows);
      }
      setImportDone(Math.min(i + BATCH, toImport.length));
    }
    setStep('done');
  }, [resolved, userId]);

  const reset = () => {
    setStep('pick-platform');
    setPlatform(null);
    setRawEntries([]);
    setResolved([]);
  };

  const newToImport = resolved.filter(r => !r.alreadyImported).length;
  const alreadyHave = resolved.filter(r => r.alreadyImported).length;
  const unmatched   = rawEntries.length - resolved.length;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>

        {/* Header */}
        <View style={styles.header}>
          {step !== 'pick-platform' && step !== 'done' ? (
            <TouchableOpacity onPress={reset} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back" accessibilityRole="button">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M19 12H5M12 5l-7 7 7 7" />
              </Svg>
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtn} />
          )}
          <Text style={styles.headerTitle}>Import Watch History</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close" accessibilityRole="button">
            <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M18 6L6 18M6 6l12 12" />
            </Svg>
          </TouchableOpacity>
        </View>

        {/* ── Step: pick platform ─────────────────────────────────────── */}
        {step === 'pick-platform' && (
          <ScrollView contentContainerStyle={styles.body}>
            <Text style={styles.stepTitle}>Choose your platform</Text>
            <Text style={styles.stepSub}>We'll import your watch history and match it to TMDB.</Text>
            {PLATFORMS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={styles.platformCard}
                onPress={() => handleSelectPlatform(p.id)}
                activeOpacity={0.75}
              >
                <View style={[styles.platformDot, { backgroundColor: p.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.platformName}>{p.name}</Text>
                  <Text style={styles.platformHint} numberOfLines={2}>{p.hint}</Text>
                </View>
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points="9,18 15,12 9,6" />
                </Svg>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── Step: pick file ─────────────────────────────────────────── */}
        {step === 'pick-file' && platform && (
          <View style={styles.body}>
            <Text style={styles.stepTitle}>{PLATFORMS.find(p => p.id === platform)!.name}</Text>
            <View style={styles.hintBox}>
              <Text style={styles.hintLabel}>How to export your data</Text>
              <Text style={styles.hintText}>{PLATFORMS.find(p => p.id === platform)!.hint}</Text>
            </View>
            <TouchableOpacity style={styles.filePicker} onPress={handlePickFile} activeOpacity={0.8}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <Polyline points="14,2 14,8 20,8" />
                <Line x1={12} y1={18} x2={12} y2={12} />
                <Line x1={9} y1={15} x2={15} y2={15} />
              </Svg>
              <Text style={styles.filePickerText}>Choose file</Text>
              <Text style={styles.filePickerSub}>CSV or JSON from {PLATFORMS.find(p => p.id === platform)!.name}</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Step: resolving ─────────────────────────────────────────── */}
        {step === 'resolving' && (
          <View style={[styles.body, styles.center]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.resolvingTitle}>Matching titles…</Text>
            <Text style={styles.resolvingCount}>{resolveDone} / {resolveTotal}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: resolveTotal > 0 ? `${(resolveDone / resolveTotal) * 100}%` : '0%' }]} />
            </View>
            <Text style={styles.resolvingSub}>Searching TMDB for each title. This may take a moment.</Text>
          </View>
        )}

        {/* ── Step: preview ───────────────────────────────────────────── */}
        {step === 'preview' && (
          <>
            <View style={styles.previewStats}>
              <StatChip label="New" value={newToImport} color={colors.accent} />
              <StatChip label="Already have" value={alreadyHave} color={colors.textMuted} />
              <StatChip label="Not matched" value={unmatched} color={colors.chipCinema} />
            </View>
            {newToImport === 0 ? (
              <View style={[styles.body, styles.center]}>
                <Text style={styles.resolvingTitle}>Nothing new to import</Text>
                <Text style={styles.resolvingSub}>All matched titles are already in your watch history.</Text>
              </View>
            ) : (
              <FlatList
                data={resolved}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={{ paddingBottom: 120 }}
                renderItem={({ item }) => (
                  <View style={[styles.previewRow, item.alreadyImported && styles.previewRowDim]}>
                    {item.posterPath ? (
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w92${item.posterPath}` }}
                        style={styles.previewPoster}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.previewPoster, styles.previewPosterFallback]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.previewMeta}>{item.mediaType === 'tv' ? 'TV Series' : 'Movie'} · {item.watchedAt}</Text>
                    </View>
                    {item.alreadyImported && (
                      <View style={styles.alreadyBadge}>
                        <Text style={styles.alreadyBadgeText}>In history</Text>
                      </View>
                    )}
                  </View>
                )}
              />
            )}
            <View style={[styles.previewFooter, { paddingBottom: insets.bottom + spacing.md }]}>
              <TouchableOpacity
                style={[styles.importBtn, newToImport === 0 && styles.importBtnDisabled]}
                onPress={handleImport}
                disabled={newToImport === 0}
                activeOpacity={0.85}
              >
                <Text style={styles.importBtnText}>
                  {newToImport > 0 ? `Import ${newToImport} title${newToImport !== 1 ? 's' : ''}` : 'Nothing to import'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step: importing ─────────────────────────────────────────── */}
        {step === 'importing' && (
          <View style={[styles.body, styles.center]}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.resolvingTitle}>Importing…</Text>
            <Text style={styles.resolvingCount}>{importDone} / {importTotal}</Text>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFill, { width: importTotal > 0 ? `${(importDone / importTotal) * 100}%` : '0%' }]} />
            </View>
          </View>
        )}

        {/* ── Step: done ──────────────────────────────────────────────── */}
        {step === 'done' && (
          <View style={[styles.body, styles.center]}>
            <View style={styles.doneIcon}>
              <Svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={colors.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="20,6 9,17 4,12" />
              </Svg>
            </View>
            <Text style={styles.resolvingTitle}>Import complete</Text>
            <Text style={styles.resolvingSub}>
              {newToImport} title{newToImport !== 1 ? 's' : ''} added to your watch history.
            </Text>
            <TouchableOpacity style={[styles.importBtn, { marginTop: spacing.lg }]} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.importBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </Modal>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.statChip}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  headerTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.lg, color: colors.textPrimary },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  body: { flex: 1, padding: spacing.xl },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  stepTitle: {
    fontFamily: fontFamily.serif,
    fontSize: fontSize.lg,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  stepSub: {
    fontFamily: fontFamily.sans,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    marginBottom: spacing.xl,
    lineHeight: 20,
  },

  platformCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  platformDot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0 },
  platformName: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary, marginBottom: 2 },
  platformHint: { fontFamily: fontFamily.sans, fontSize: 11, color: colors.textMuted, lineHeight: 16 },

  hintBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.xs,
  },
  hintLabel: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary },
  hintText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20 },

  filePicker: {
    borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed',
    borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl * 1.5,
    gap: spacing.sm,
  },
  filePickerText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.accent },
  filePickerSub: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },

  resolvingTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.md, color: colors.textPrimary },
  resolvingCount: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textMuted },
  resolvingSub: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 20, maxWidth: 280 },

  progressBarBg: {
    width: '100%', height: 4, backgroundColor: colors.surfaceSunken,
    borderRadius: 2, overflow: 'hidden',
  },
  progressBarFill: { height: '100%', backgroundColor: colors.accent, borderRadius: 2 },

  previewStats: {
    flexDirection: 'row', gap: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  statChip: {
    flex: 1, backgroundColor: colors.surface,
    borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    padding: spacing.sm, alignItems: 'center', gap: 2,
  },
  statValue: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md },
  statLabel: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },

  previewRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  previewRowDim: { opacity: 0.45 },
  previewPoster: { width: 36, height: 54, borderRadius: 4, backgroundColor: colors.surfaceSunken },
  previewPosterFallback: {},
  previewTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  previewMeta: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
  alreadyBadge: {
    backgroundColor: colors.surfaceSunken, borderRadius: radii.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  alreadyBadgeText: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted },

  previewFooter: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    paddingHorizontal: spacing.xl, paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  importBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: spacing.md, alignItems: 'center',
  },
  importBtnDisabled: { backgroundColor: colors.surfaceSunken },
  importBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },

  doneIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
});
