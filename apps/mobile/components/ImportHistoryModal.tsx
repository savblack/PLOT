import { useState, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  Modal, Alert, ActivityIndicator, StyleSheet, FlatList,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Line } from 'react-native-svg';
import { tmdb } from '../lib/tmdb';
import { parsePlatform, type ParsedImportEntry } from '@plot/core/importParsing.js';
import { dedupeEntries } from '@plot/core/importDedup.js';
import { planHistoryImport } from '@plot/core/importPlan.js';
import {
  resolveImportEntries, readExistingHistory, buildImportRows, writeImportRows,
} from '@plot/core/importPipeline.js';
import { IMPORT_VIEW } from '@plot/core/copy/importView.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useMediaSync } from '../hooks/useMediaSync';
import { useTraktSync } from '../hooks/useTraktSync';

type Platform = 'plex' | 'trakt' | 'netflix' | 'prime' | 'disney' | 'max' | 'apple' | 'letterboxd';
type PlatformConfig = { id: Platform; name: string; color: string; hint: string; accept?: string[]; kind?: 'connection' };

// ── Platform config ───────────────────────────────────────────────────

const PLATFORMS: PlatformConfig[] = [
  {
    id: 'plex',
    name: 'Plex',
    color: 'rating',
    hint: IMPORT_VIEW.connectionImportHint,
    kind: 'connection',
  },
  {
    id: 'trakt',
    name: 'Trakt',
    color: 'danger',
    hint: IMPORT_VIEW.connectionImportHint,
    kind: 'connection',
  },
  {
    id: 'letterboxd',
    name: 'Letterboxd',
    color: 'success',
    hint: 'Settings → Data → Export your data → unzip → choose diary.csv or watched.csv',
    accept: ['text/csv', 'application/csv', 'text/plain', 'public.comma-separated-values-text'],
  },
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

/* Resolution, the existing-history read, row building and the batched write all
   live in @plot/core/importPipeline.js so web runs the same rules. This file
   previously carried its own copy of each, and every one of them differed:
   release year was ignored when picking a TMDB match, ratings and reviews were
   dropped, and the existing-history read was unscoped and unpaginated, so past
   the row cap it overwrote what it could not see. */

/** One entry after TMDB resolution — core's shape, matched or not. */
interface ResolvedEntry {
  status: 'matched' | 'unmatched';
  title: string;
  tmdbId?: number;
  mediaType?: 'movie' | 'tv';
  tmdbTitle?: string;
  posterPath?: string | null;
}

/** A history row as core builds it, matching the `history` table. */
interface HistoryRow {
  user_id: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  genre_ids: number[];
  watched_at: string;
  rating?: number;
  note?: string;
}

/** A row paired with the index of the resolved entry it came from. */
interface ImportCandidate {
  index: number;
  row: HistoryRow;
}

type Step = 'pick-platform' | 'pick-file' | 'connection' | 'resolving' | 'preview' | 'importing' | 'done';

// ── Main modal ────────────────────────────────────────────────────────

interface Props {
  userId: string;
  onClose: () => void;
}

export default function ImportHistoryModal({ userId, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const plex = useMediaSync(userId);
  const trakt = useTraktSync(userId);

  const [step,         setStep]         = useState<Step>('pick-platform');
  const [platform,     setPlatform]     = useState<Platform | null>(null);
  const [resolved,     setResolved]     = useState<ResolvedEntry[]>([]);
  const [existingRows, setExistingRows] = useState<{ tmdb_id: number; media_type: string }[]>([]);
  const [resolveTotal, setResolveTotal] = useState(0);
  const [resolveDone,  setResolveDone]  = useState(0);
  const [importDone,   setImportDone]   = useState(0);
  const [importTotal,  setImportTotal]  = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [alreadyCount, setAlreadyCount] = useState(0);

  const handleSelectPlatform = (p: Platform) => {
    setPlatform(p);
    setStep(PLATFORMS.find(item => item.id === p)?.kind === 'connection' ? 'connection' : 'pick-file');
  };

  const handlePickFile = useCallback(async () => {
    if (!platform) return;
    const cfg = PLATFORMS.find(p => p.id === platform)!;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: cfg.accept ?? '*/*',
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
      setResolveTotal(deduped.length);
      setResolveDone(0);
      setStep('resolving');

      const results = await resolveImportEntries(deduped, {
        search: (title: string) => tmdb.search(title),
        onProgress: (done: number) => setResolveDone(done),
      });

      // Only the titles this import resolved to, chunked and paged. Reading the
      // whole history in one call truncated at the row cap, which made the
      // planner treat rows already there as new and the write overwrite their
      // rating and note.
      const { rows: existing, error } = await readExistingHistory({
        userId,
        tmdbIds: (results as ResolvedEntry[])
          .filter(r => r.status === 'matched')
          .map(r => r.tmdbId as number),
      });

      // Planning against a partial history is the data-loss path. Stop.
      if (error) {
        Alert.alert('Import stopped', IMPORT_VIEW.couldNotReadHistory);
        setStep('pick-file');
        return;
      }

      setExistingRows(existing);
      setResolved(results);
      setStep('preview');
    } catch {
      Alert.alert('Error', 'Could not read the file. Please try again.');
      setStep('pick-file');
    }
  }, [platform, userId]);

  /* One plan drives both the preview and the write. Nothing here deletes: the
     old version cleared every history row for the titles in the file before
     inserting, so a batch that failed left the user's history shorter than it
     started. planHistoryImport resolves the collisions instead, and the write
     is a plain upsert on the constraint that actually exists. */
  const candidates: ImportCandidate[] = useMemo(
    () => buildImportRows({ userId, resolved }) as ImportCandidate[],
    [resolved, userId],
  );

  const plan = useMemo(
    () => planHistoryImport({ rows: candidates.map(c => c.row), existing: existingRows }),
    [candidates, existingRows],
  );

  /* Row identity survives the planner, so the preview can mark each result by
     whether its own row made it through. Keyed on the index into `resolved`,
     which is what buildImportRows preserves. */
  const plannedRows = useMemo(() => new Set(plan.rows), [plan]);
  const rowByIndex = useMemo(
    () => new Map(candidates.map(c => [c.index, c.row])),
    [candidates],
  );
  const isNew = useCallback((index: number) => {
    const row = rowByIndex.get(index);
    return row != null && plannedRows.has(row);
  }, [rowByIndex, plannedRows]);

  const matched = useMemo(
    () => resolved.filter((r: ResolvedEntry) => r.status === 'matched'),
    [resolved],
  );

  const handleImport = useCallback(async () => {
    const rows = plan.rows;
    if (rows.length === 0) {
      setImportedCount(0);
      setStep('done');
      return;
    }

    setImportTotal(rows.length);
    setImportDone(0);
    setStep('importing');

    // Batches, counts failures rather than swallowing them, and signals the
    // history change so a mounted useHistory reloads — mobile never did.
    const { inserted, failed } = await writeImportRows(rows, {
      onProgress: (done: number) => setImportDone(done),
    });

    setImportedCount(inserted);
    if (failed) {
      Alert.alert('Some titles could not be saved', IMPORT_VIEW.partialFailure(failed));
    }
    setStep('done');
  }, [plan]);

  const connection = platform === 'plex' ? plex : platform === 'trakt' ? trakt : null;
  const connectionName = platform === 'plex' ? 'Plex' : 'Trakt';

  const handleConnectionImport = useCallback(async () => {
    if (!connection) return;
    const result = await connection.importHistory();
    if (!result) {
      Alert.alert('Import stopped', connection.error || IMPORT_VIEW.importFailed);
      return;
    }
    setImportedCount(result.importedCount || 0);
    setAlreadyCount(result.alreadyCount || 0);
    setStep('done');
  }, [connection]);

  const reset = () => {
    setStep('pick-platform');
    setPlatform(null);
    setResolved([]);
    setExistingRows([]);
  };

  const newToImport = plan.rows.length;
  const alreadyHave = matched.length - newToImport;
  const unmatched   = resolved.length - matched.length;

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
            <Text style={styles.stepSub}>{IMPORT_VIEW.chooseSource}</Text>
            {PLATFORMS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={styles.platformCard}
                onPress={() => handleSelectPlatform(p.id)}
                activeOpacity={0.75}
              >
                <View style={[styles.platformDot, {
                  backgroundColor: p.color.startsWith('#')
                    ? p.color
                    : colors[p.color as keyof Palette],
                }]} />
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

        {/* ── Step: connected account ──────────────────────────────── */}
        {step === 'connection' && platform && connection && (
          <View style={styles.body}>
            <Text style={styles.stepTitle}>{connectionName}</Text>
            <Text style={styles.stepSub}>
              {connection.isConnected
                ? IMPORT_VIEW.connectedReady(connectionName)
                : IMPORT_VIEW.connectionImportHint}
            </Text>
            {platform === 'plex' && (
              <View style={styles.hintBox}>
                <Text style={styles.hintText}>{IMPORT_VIEW.plexServerRequired}</Text>
              </View>
            )}
            {connection.error && <Text style={styles.errorText}>{connection.error}</Text>}
            <TouchableOpacity
              style={[styles.importBtn, styles.connectionAction, (connection.syncing || ('polling' in connection && connection.polling)) && styles.importBtnDisabled]}
              onPress={connection.isConnected
                ? handleConnectionImport
                : platform === 'plex' ? plex.startPlexAuth : trakt.connect}
              disabled={connection.syncing || ('polling' in connection && connection.polling)}
              activeOpacity={0.85}
            >
              <Text style={styles.importBtnText}>
                {'polling' in connection && connection.polling
                  ? 'Waiting for Plex approval…'
                  : connection.syncing
                    ? IMPORT_VIEW.importingFrom(connectionName)
                    : connection.isConnected
                      ? IMPORT_VIEW.importFrom(connectionName)
                      : IMPORT_VIEW.connectToImport(connectionName)}
              </Text>
            </TouchableOpacity>
          </View>
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
                /* The rows themselves, so the preview shows exactly what the
                   write will send — same list the planner ran against. */
                data={candidates}
                keyExtractor={(c: ImportCandidate) => String(c.index)}
                contentContainerStyle={{ paddingBottom: 120 }}
                renderItem={({ item }: { item: ImportCandidate }) => (
                  <View style={[styles.previewRow, !isNew(item.index) && styles.previewRowDim]}>
                    {item.row.poster_path ? (
                      <Image
                        source={{ uri: `https://image.tmdb.org/t/p/w92${item.row.poster_path}` }}
                        style={styles.previewPoster}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={[styles.previewPoster, styles.previewPosterFallback]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={styles.previewTitle} numberOfLines={1}>{item.row.title}</Text>
                      <Text style={styles.previewMeta}>{item.row.media_type === 'tv' ? 'TV Series' : 'Movie'} · {item.row.watched_at}</Text>
                    </View>
                    {!isNew(item.index) && (
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
              {platform === 'plex' || platform === 'trakt'
                ? IMPORT_VIEW.importedSummary(importedCount, alreadyCount)
                : `${importedCount} title${importedCount !== 1 ? 's' : ''} added to your watch history.`}
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
  headerTitle: { fontFamily: fontFamily.displaySemi, fontSize: fontSize.lg, color: colors.textPrimary },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  body: { flex: 1, padding: spacing.xl },
  center: { alignItems: 'center', justifyContent: 'center', gap: spacing.md },

  stepTitle: {
    fontFamily: fontFamily.display,
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
  errorText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, lineHeight: 20, marginBottom: spacing.md },

  filePicker: {
    borderWidth: 1.5, borderColor: colors.accent, borderStyle: 'dashed',
    borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xl * 1.5,
    gap: spacing.sm,
  },
  filePickerText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.accent },
  filePickerSub: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },

  resolvingTitle: { fontFamily: fontFamily.displaySemi, fontSize: fontSize.md, color: colors.textPrimary },
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
  connectionAction: { alignSelf: 'flex-start', paddingHorizontal: spacing.xl },
  importBtnDisabled: { backgroundColor: colors.surfaceSunken },
  importBtnText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: '#fff' },

  doneIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accentDim,
    alignItems: 'center', justifyContent: 'center',
  },
});
