/**
 * Home's cards for background imports (import_jobs): the running job with
 * progress (and what waits behind it), then every finished job the user
 * hasn't seen off, with the counts and the way to finish what it left for
 * review. The jobs are read and polled by @plot/core/importJobs.js; this is
 * the render. Web: apps/web/src/components/ImportJobCard.jsx, on the same
 * core hook.
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useImportJobs, importJobTitle, importJobStatusLine, importJobActive, importJobFinished, importSourceName } from '@plot/core/importJobs.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { createImportReporter, IMPORT_FAILURE_REASONS } from '@plot/core/importPipeline.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { markImportDone } from '../lib/finishingTouches';
import { suppressFirstWinForImport } from '../lib/firstWinCard';
import ImportSourceIcon from './ImportSourceIcon';

const C = IMPORT_JOBS.card;

export type ImportJobRow = {
  id: string; user_id: string; source: string; kind: string; entry: string; status: string; phase: string;
  progress_done: number; progress_total: number; imported: number; duplicates: number; failed: number;
  review_count: number; last_error: string | null; seen_at: string | null;
};

interface Props {
  userId: string;
  /** The finished job left entries to match: open the review on them. */
  onReview: (job: ImportJobRow) => void;
  /** A finished import was seen for the first time on this device. */
  onFinished?: (job: ImportJobRow) => void;
}

export default function ImportJobCard({ userId, onReview, onFinished }: Props) {
  const { jobs, current, queued, cancel, dismiss } = useImportJobs(userId);
  // The running job (with what waits behind it), then each finished job the
  // user hasn't seen off. Queued jobs don't get a card of their own.
  const shown = [current, ...jobs.filter((job: ImportJobRow) => importJobFinished(job) && !job.seen_at)].filter(Boolean) as ImportJobRow[];
  if (!shown.length) return null;
  return (
    <>
      {shown.map(job => (
        <JobCard key={job.id} userId={userId} job={job} queued={job.id === current?.id ? queued : []} onReview={onReview} onFinished={onFinished} cancel={() => { void cancel(job.id); }} dismiss={() => { void dismiss(job.id); }} />
      ))}
    </>
  );
}

function JobCard({ userId, job, queued, onReview, onFinished, cancel, dismiss }: {
  userId: string; job: ImportJobRow; queued: { source: string }[]; onReview: Props['onReview']; onFinished?: Props['onFinished']; cancel: () => void; dismiss: () => void;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const active = importJobActive(job);

  // The first time a finished job is seen on this device: tick Finishing
  // touches and stand the first-win card down, as the modal import does.
  const noted = useRef<string | null>(null);
  useEffect(() => {
    if (!importJobFinished(job) || noted.current === job.id) return;
    noted.current = job.id;
    // The same import_completed / import_failed the modal import reports.
    const reporter = createImportReporter({ entry: job.entry });
    if (job.status === 'failed') reporter.report('failed', { source: job.source, reason: IMPORT_FAILURE_REASONS.WRITE_FAILED });
    else if (job.status !== 'cancelled') reporter.report('completed', { source: job.source, count: job.imported, failed_count: job.failed });
    if (job.imported > 0) {
      void markImportDone(userId, job.source, job.imported);
      void suppressFirstWinForImport(userId, job.source);
    }
    onFinished?.(job);
  }, [userId, job, onFinished]);

  const pct = job.progress_total ? Math.min(100, Math.round((job.progress_done / job.progress_total) * 100)) : null;
  const line = [importJobStatusLine(job), queued.length ? C.thenNext(importSourceName(queued[0].source)) : null].filter(Boolean).join(' · ');
  const done = !active && job.status !== 'cancelled';
  const sourceId = job.source === 'trakt-export' ? 'trakt' : job.source;

  return (
    <View style={[styles.card, !active && styles.cardDone, job.status === 'failed' && styles.cardFailed]} accessibilityLiveRegion="polite" accessibilityLabel={importJobTitle(job)}>
      <View style={styles.row}>
        <ImportSourceIcon id={sourceId} name={job.source} size={32} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.title} accessibilityRole="header">{importJobTitle(job)}</Text>
          {line ? <Text style={styles.line}>{line}</Text> : null}
        </View>
      </View>
      {active && (
        <View style={styles.bar} accessibilityRole="progressbar" accessibilityLabel={C.progressLabel} accessibilityValue={pct == null ? undefined : { min: 0, max: 100, now: pct }}>
          <View style={[styles.barFill, { width: pct == null ? '35%' : `${pct}%` }]} />
        </View>
      )}
      <View style={styles.actions}>
        {active && <TouchableOpacity onPress={cancel} accessibilityRole="button"><Text style={styles.link}>{C.cancel}</Text></TouchableOpacity>}
        {done && job.review_count > 0 && (
          <TouchableOpacity style={styles.button} onPress={() => onReview(job)} accessibilityRole="button"><Text style={styles.buttonText}>{C.reviewCta}</Text></TouchableOpacity>
        )}
        {done && job.imported > 0 && job.review_count === 0 && (
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => { dismiss(); router.push('/(app)/history' as Href); }} accessibilityRole="button"><Text style={styles.buttonSecondaryText}>{C.historyCta}</Text></TouchableOpacity>
        )}
        {job.status === 'failed' && (
          <TouchableOpacity style={styles.buttonSecondary} onPress={() => { dismiss(); router.push(`/(app)/settings?section=connections&source=${sourceId}` as Href); }} accessibilityRole="button"><Text style={styles.buttonSecondaryText}>{C.retryCta}</Text></TouchableOpacity>
        )}
        {!active && <TouchableOpacity onPress={dismiss} accessibilityRole="button"><Text style={styles.link}>{C.dismiss}</Text></TouchableOpacity>}
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.lg, padding: spacing.md, gap: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  cardDone: { backgroundColor: colors.accentSecondaryDim, borderColor: 'transparent' },
  cardFailed: { backgroundColor: colors.dangerDim },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.34, color: colors.textPrimary },
  line: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  bar: { height: 6, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.accent },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.md, flexWrap: 'wrap' },
  link: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary, paddingVertical: 4 },
  button: { height: 36, paddingHorizontal: 14, borderRadius: radii.pill, backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.bg },
  buttonSecondary: { height: 36, paddingHorizontal: 14, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  buttonSecondaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
