/**
 * Settings › Connections › Your sources: one row per source the account has
 * brought history in from, whether a connected account (Trakt, Plex, Simkl)
 * or a file uploaded once (Letterboxd, Netflix, …). Each row carries its own
 * status and opens a detail sheet with its history, the automatic toggle
 * (accounts), a way to import again, and remove. "Add a source" opens the
 * same lanes as onboarding (ImportSourceLanes + ImportSourceSheet on
 * useImportStart). Mirrors apps/web/src/components/SettingsSources.jsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { useTrackingJobs } from '@plot/core/useTrackingJobs.js';
import { IMPORT_SOURCES, findImportSource, type ImportSource } from '@plot/core/onboardingSetup.js';
import { importJobActive, importJobFinished, importJobStatusLine, importSourceName } from '@plot/core/importJobs.js';
import { IMPORT_ENTRY_POINTS } from '@plot/core/importPipeline.js';
import { TRACKING } from '@plot/core/copy/tracking.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { COMMON } from '@plot/core/copy/common.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useImportStart, type ImportStart } from '../hooks/useImportStart';
import type { MediaIntegration } from '../hooks/useTraktSync';
import ImportSourceIcon from './ImportSourceIcon';
import ImportSourceLanes, { ImportPill } from './ImportSourceLanes';
import ImportSourceSheet, { BottomSheet, PlexPicker, SourceTitle } from './ImportSourceSheet';

const T = SETTINGS_VIEW.sources;
const C = IMPORT_JOBS.card;

type Job = {
  id: string; user_id: string; source: string; status: string; imported: number; review_count: number;
  last_error: string | null; created_at: string; finished_at?: string | null;
};
type Integration = MediaIntegration & { selected_server?: { name: string; profileName: string } | null };
type Connection = { integration_id: string; automatic_enabled: boolean };
type ChipKind = 'run' | 'queued' | 'ok' | 'warn' | 'bad' | 'off';

const shortDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

function Chip({ kind, text }: { kind: ChipKind; text: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const mark = kind === 'ok' ? '✓' : kind === 'warn' ? '!' : kind === 'bad' ? '✕' : '';
  const tone = kind === 'run' || kind === 'queued' ? styles.chipRun : kind === 'ok' ? styles.chipOk : kind === 'warn' ? styles.chipWarn : kind === 'bad' ? styles.chipBad : styles.chipOff;
  return (
    <View style={[styles.chip, tone]}>
      {kind === 'run' ? <View style={styles.chipDot} /> : mark ? <Text style={styles.chipMark}>{mark}</Text> : null}
      <Text style={styles.chipText}>{text}</Text>
    </View>
  );
}

/**
 * The status chip and the words after it, from the same parts every time:
 * state, what it's doing or last did, when and how many.
 */
function statusFor({ src, integration, jobs, current, connection, trackingEnabled = false }: { src: ImportSource; integration: Integration | null; jobs: Job[]; current: Job | null; connection: Connection | null; trackingEnabled?: boolean }) {
  const active = jobs.find(importJobActive) || null;
  const finished = jobs.filter(importJobFinished);
  const last = finished.find(job => job.status !== 'cancelled') || null;
  const countOf = (job: Job) => T.titles(job.imported || 0);
  const parts: string[] = [];
  let chip: { kind: ChipKind; text: string };
  if (active) {
    if (active.id === current?.id) {
      chip = { kind: 'run', text: T.chipImporting };
      parts.push(importJobStatusLine(active));
    } else {
      chip = { kind: 'queued', text: T.chipQueued };
      if (current) parts.push(T.startsAfter(importSourceName(current.source)));
    }
    if (last) parts.push(T.previousImport(shortDate(last.finished_at || last.created_at), countOf(last)));
  } else if (src.lane === 'connect' && integration?.status === 'active') {
    if (src.id === 'plex' && !integration.selected_server) {
      chip = { kind: 'warn', text: T.chipNeedsServer };
      parts.push(T.pickServer);
    } else if (last && last.review_count > 0) {
      chip = { kind: 'warn', text: T.chipToMatch(last.review_count) };
    } else if (last?.status === 'failed') {
      chip = { kind: 'bad', text: T.chipStopped };
    } else {
      chip = { kind: 'ok', text: T.chipConnected };
    }
    if (integration.display_name) parts.push(T.connectedAs(integration.display_name));
    if (trackingEnabled && connection?.automatic_enabled) parts.push(T.checksDaily);
    if (last && last.status !== 'failed') parts.push(T.lastImport(shortDate(last.finished_at || last.created_at), countOf(last)));
    if (last?.status === 'failed') parts.push(last.last_error || IMPORT_JOBS.errors.gaveUp);
  } else if (last && last.review_count > 0) {
    chip = { kind: 'warn', text: T.chipToMatch(last.review_count) };
    parts.push(T.imported(shortDate(last.finished_at || last.created_at), countOf(last)));
  } else if (last?.status === 'failed') {
    chip = { kind: 'bad', text: T.chipStopped };
    parts.push(last.last_error || IMPORT_JOBS.errors.gaveUp);
  } else if (last) {
    chip = { kind: 'ok', text: T.chipDone };
    parts.push(T.imported(shortDate(last.finished_at || last.created_at), countOf(last)));
  } else {
    chip = { kind: 'off', text: T.chipCancelled };
  }
  return { chip, line: parts.join(' · '), active, last };
}

function HistoryRow({ job, current, onFinish, onRetry, onCancel }: { job: Job; current: Job | null; onFinish: (job: Job) => void; onRetry: () => void; onCancel: (job: Job) => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const active = importJobActive(job);
  const running = active && job.id === current?.id;
  const when = shortDate(job.finished_at || job.created_at);
  const line = active
    ? (running ? importJobStatusLine(job) : T.startsAfter(importSourceName(current?.source || '')))
    : importJobStatusLine(job);
  let chip: { kind: ChipKind; text: string };
  if (active) chip = running ? { kind: 'run', text: T.chipImporting } : { kind: 'queued', text: T.chipQueued };
  else if (job.status === 'failed') chip = { kind: 'bad', text: T.chipStopped };
  else if (job.status === 'cancelled') chip = { kind: 'off', text: T.chipCancelled };
  else if (job.review_count > 0) chip = { kind: 'warn', text: T.chipToMatch(job.review_count) };
  else chip = { kind: 'ok', text: T.chipDone };
  return (
    <View style={styles.histRow}>
      <View style={styles.histHead}>
        <Text style={styles.histWhen}>{when}{active ? ` · ${T.running}` : ''}</Text>
        <Chip kind={chip.kind} text={chip.text} />
      </View>
      {line ? <Text style={styles.histLine}>{line}</Text> : null}
      <View style={styles.histActions}>
        {active && <TouchableOpacity onPress={() => onCancel(job)} accessibilityRole="button"><Text style={styles.linkText}>{T.cancel}</Text></TouchableOpacity>}
        {!active && job.review_count > 0 && (
          <TouchableOpacity style={styles.smallButton} onPress={() => onFinish(job)} accessibilityRole="button"><Text style={styles.smallButtonText}>{T.finishMatching}</Text></TouchableOpacity>
        )}
        {job.status === 'failed' && (
          <TouchableOpacity style={styles.smallButtonSecondary} onPress={onRetry} accessibilityRole="button"><Text style={styles.smallButtonSecondaryText}>{T.tryAgain}</Text></TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SourceDetail({ src, integration, jobs, current, connection, tracking, start, isPremium, onClose, onImport, onRemove, onFinish, onCancel, onPremium }: {
  src: ImportSource; integration: Integration | null; jobs: Job[]; current: Job | null; connection: Connection | null;
  tracking: ReturnType<typeof useTrackingJobs>; start: ImportStart; isPremium: boolean;
  onClose: () => void; onImport: () => void; onRemove: (importedTotal: number) => void; onFinish: (job: Job) => void; onCancel: (job: Job) => void; onPremium: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const status = statusFor({ src, integration, jobs, current, connection, trackingEnabled: tracking.enabled });
  const reviews = (tracking.reviews || []).filter(review => review.payload?.event?.source === src.id);
  const sourceJobs = jobs.filter(job => job.status !== 'cancelled' || job.id === current?.id);
  const importedTotal = jobs.reduce((sum, job) => sum + (job.imported || 0), 0);
  const connectedAccount = src.lane === 'connect' && integration?.status === 'active';
  const plexSource = src.id === 'plex' && connectedAccount ? start.accounts.plexSource : null;
  const plexLoaded = !!plexSource?.servers;
  // Settings lists the servers as soon as the detail opens.
  const plexChoose = plexSource?.choose;
  useEffect(() => {
    if (plexSource && !plexLoaded && !plexSource.busy) void plexChoose?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the loaded flag is the guard
  }, [!!plexSource, plexLoaded]);
  const toggleAutomatic = () => {
    if (!isPremium) { onPremium(); return; }
    if (integration) void tracking.control(integration.id, connection?.automatic_enabled ? 'disable_automatic' : 'enable_automatic');
  };
  const ctaOff = !!status.active || (!!plexSource && !plexSource.selected);
  return (
    <BottomSheet title={<SourceTitle id={src.id} name={src.name} />} onClose={onClose} tall>
      <View style={styles.detail}>
        <View style={styles.statusRow}>
          <Chip kind={status.chip.kind} text={status.chip.text} />
          {status.line ? <Text style={styles.statusLine}>{status.line}</Text> : null}
        </View>
        {connectedAccount && (
          <>
            {tracking.enabled && (
              <View style={[styles.card, styles.switchRow]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{T.automaticLabel}</Text>
                  <Text style={styles.rowHint}>{T.automaticHint(src.name)}</Text>
                </View>
                <Switch value={!!connection?.automatic_enabled} onValueChange={toggleAutomatic} disabled={tracking.busy} trackColor={{ true: colors.accent }} accessibilityLabel={T.automaticLabel} />
              </View>
            )}
            {plexSource && plexLoaded && (
              <PlexPicker plex={{ servers: plexSource.servers || [], profiles: plexSource.profiles || [], serverId: plexSource.serverId || null, selected: !!plexSource.selected, selection: plexSource.selection || null, busy: plexSource.busy, error: plexSource.error || null, choose: plexSource.choose }} />
            )}
            <TouchableOpacity style={[styles.cta, ctaOff && styles.ctaOff]} disabled={ctaOff} onPress={onImport} accessibilityRole="button" accessibilityState={{ disabled: ctaOff }}>
              <Text style={styles.ctaText}>{src.id === 'plex' ? T.importFromProfile : T.importHistory}</Text>
            </TouchableOpacity>
          </>
        )}
        {src.lane === 'upload' && (
          <>
            <TouchableOpacity style={[styles.cta, !!status.active && styles.ctaOff]} disabled={!!status.active} onPress={onImport} accessibilityRole="button" accessibilityState={{ disabled: !!status.active }}>
              <Text style={styles.ctaText}>{T.importNewerExport}</Text>
            </TouchableOpacity>
            <Text style={styles.hint}>{T.importNewerHint}</Text>
          </>
        )}
        <Text style={styles.label}>{T.history}</Text>
        <View style={styles.card}>
          {sourceJobs.length === 0 && reviews.length === 0 && <Text style={styles.emptyLine}>{T.noHistory}</Text>}
          {sourceJobs.map(job => <HistoryRow key={job.id} job={job} current={current} onFinish={onFinish} onRetry={onImport} onCancel={onCancel} />)}
          {reviews.map(review => (
            <View style={styles.histRow} key={review.id}>
              <Text style={styles.histWhen}>{T.duplicateWatch}</Text>
              <Text style={styles.histLine}>{review.payload?.summary?.title} · {TRACKING.reviewDetails(review.payload.event)}</Text>
              <View style={styles.histActions}>
                <TouchableOpacity style={styles.smallButtonSecondary} disabled={tracking.busy} onPress={() => { void tracking.resolve(review.id, true); }} accessibilityRole="button"><Text style={styles.smallButtonSecondaryText}>{T.keepWatch}</Text></TouchableOpacity>
                <TouchableOpacity disabled={tracking.busy} onPress={() => { void tracking.resolve(review.id, false); }} accessibilityRole="button"><Text style={styles.linkText}>{T.skipWatch}</Text></TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
        {tracking.error ? <Text style={styles.error}>{tracking.error}</Text> : null}
        {connectedAccount && (
          <>
            <TouchableOpacity style={styles.removeLink} onPress={() => onRemove(importedTotal)} accessibilityRole="button"><Text style={styles.removeText}>{T.remove(src.name)}</Text></TouchableOpacity>
            <Text style={[styles.hint, styles.hintCenter]}>{T.stays}</Text>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

function Chevron() {
  const { colors } = useTheme();
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9,18 15,12 9,6" />
    </Svg>
  );
}

interface Props {
  userId: string | null;
  isPremium: boolean;
  /** Free account on the automatic toggle: the Premium plans. */
  onPremium: () => void;
  /** A finished job left entries to match: open the review on them. */
  onFinish: (job: { id: string; user_id: string; source: string }) => void;
  /** A source to open on straight away (Home's "Try again"). */
  initialOpen?: string | null;
}

export default function SettingsSources({ userId, isPremium, onPremium, onFinish, initialOpen = null }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const start = useImportStart({ userId, entry: IMPORT_ENTRY_POINTS.SETTINGS, history: true });
  const tracking = useTrackingJobs(userId);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(initialOpen);

  const { trakt, plex, simkl } = start.accounts;
  const integrations = useMemo<Record<string, Integration | null>>(() => ({ trakt: trakt.integration, plex: plex.integration as Integration | null, simkl: simkl.integration }), [trakt.integration, plex.integration, simkl.integration]);
  const jobsBySource = useMemo(() => {
    const map: Record<string, Job[]> = {};
    for (const job of start.jobs as Job[]) {
      const id = job.source === 'trakt-export' ? 'trakt' : job.source;
      (map[id] ||= []).push(job);
    }
    return map;
  }, [start.jobs]);
  const connectionFor = (id: string): Connection | null => {
    const integration = integrations[id];
    return integration ? (tracking.connections as Connection[]).find(row => row.integration_id === integration.id) || null : null;
  };

  // A source row: an account that's connected (or has jobs), or a file source with any job in the window.
  const rows = IMPORT_SOURCES.filter(src => {
    const jobs = jobsBySource[src.id] || [];
    if (src.lane === 'connect') return integrations[src.id]?.status === 'active' || jobs.length > 0;
    return jobs.length > 0;
  });

  const refreshAll = () => { void start.refreshJobs(); void trakt.loadIntegration(); void plex.loadIntegration(); void simkl.loadIntegration(); if (tracking.enabled) void tracking.load(); };
  const cancelJob = (job: Job) => { void start.cancelJob(job.id); };
  const importFrom = (id: string) => { setOpen(null); setAdding(false); start.pick(id); };
  const premiumGate = () => Alert.alert(
    T.automaticNeedsPremium,
    T.automaticNeedsPremiumMessage,
    [
      { text: SETTINGS_VIEW.premium.upgradeButton, onPress: onPremium },
      { text: COMMON.cancel, style: 'cancel' },
    ],
  );
  const removeSource = (src: ImportSource, importedTotal: number) => Alert.alert(
    T.removeTitle(src.name),
    T.removeMessage(src.name, importedTotal ? T.titles(importedTotal) : ''),
    [
      { text: COMMON.cancel, style: 'cancel' },
      {
        text: T.removeConfirm,
        style: 'destructive',
        onPress: async () => {
          setOpen(null);
          if (src.id === 'trakt') await trakt.disconnect();
          else if (src.id === 'plex') await plex.disconnect();
          else if (src.id === 'simkl') await simkl.disconnect();
          refreshAll();
        },
      },
    ],
  );

  const current = start.current as Job | null;
  const openSrc = open ? findImportSource(open) : null;

  return (
    <>
      {current && start.pill && (
        <View style={styles.running} accessibilityLiveRegion="polite">
          <ImportPill pill={start.pill} />
          <TouchableOpacity onPress={() => cancelJob(current)} accessibilityRole="button" style={styles.runningCancel}><Text style={styles.linkText}>{C.cancel}</Text></TouchableOpacity>
        </View>
      )}

      <View style={styles.group}>
        <Text style={styles.groupTitle}>{T.groupTitle}</Text>
        <View style={styles.groupCard}>
          {rows.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyLogos} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                {['trakt', 'letterboxd', 'netflix', 'plex', 'disney', 'apple'].map(id => <ImportSourceIcon key={id} id={id} name={id} size={26} />)}
              </View>
              <Text style={styles.emptyTitle}>{T.emptyTitle}</Text>
              <Text style={styles.emptyBody}>{T.emptyBody}</Text>
              <TouchableOpacity style={styles.smallButton} onPress={() => setAdding(true)} accessibilityRole="button"><Text style={styles.smallButtonText}>{T.addSource}</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              {rows.map(src => {
                const jobs = jobsBySource[src.id] || [];
                const integration = integrations[src.id];
                const status = statusFor({ src, integration, jobs, current, connection: connectionFor(src.id), trackingEnabled: tracking.enabled });
                const needsServer = src.id === 'plex' && integration?.status === 'active' && !integration.selected_server;
                const toMatch = !status.active && status.last && status.last.review_count > 0 ? status.last : null;
                return (
                  <TouchableOpacity key={src.id} style={styles.row} onPress={() => setOpen(src.id)} accessibilityRole="button" accessibilityLabel={T.open(src.name)}>
                    <ImportSourceIcon id={src.id} name={src.name} size={34} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={styles.rowLabel}>{src.name}</Text>
                      <View style={styles.statusRow}>
                        <Chip kind={status.chip.kind} text={status.chip.text} />
                        {status.line ? <Text style={styles.rowHint} numberOfLines={2}>{status.line}</Text> : null}
                      </View>
                    </View>
                    {needsServer && <TouchableOpacity style={styles.smallButton} onPress={() => setOpen(src.id)} accessibilityRole="button"><Text style={styles.smallButtonText}>{T.chooseServer}</Text></TouchableOpacity>}
                    {toMatch && <TouchableOpacity style={styles.smallButton} onPress={() => onFinish(toMatch)} accessibilityRole="button"><Text style={styles.smallButtonText}>{T.finishMatching}</Text></TouchableOpacity>}
                    <Chevron />
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.row} onPress={() => setAdding(true)} accessibilityRole="button">
                <View style={styles.plus}><Text style={styles.plusText}>+</Text></View>
                <Text style={[styles.rowLabel, { flex: 1 }]}>{T.addSource}</Text>
                <Chevron />
              </TouchableOpacity>
            </>
          )}
        </View>
        {rows.length > 0 && <Text style={styles.foot}>{T.foot}</Text>}
      </View>

      {adding && (
        <BottomSheet title={T.addSourceTitle} sub={T.addSourceSub} onClose={() => setAdding(false)} tall>
          <ImportSourceLanes jobs={start.jobs} current={current} connectedIds={start.connectedIds} onPick={importFrom} />
        </BottomSheet>
      )}

      {openSrc && !start.source && (
        <SourceDetail
          src={openSrc}
          integration={integrations[openSrc.id]}
          jobs={jobsBySource[openSrc.id] || []}
          current={current}
          connection={connectionFor(openSrc.id)}
          tracking={tracking}
          start={start}
          isPremium={isPremium}
          onClose={() => setOpen(null)}
          onImport={() => importFrom(openSrc.id)}
          onRemove={(importedTotal) => removeSource(openSrc, importedTotal)}
          onFinish={(job) => { setOpen(null); onFinish(job); }}
          onCancel={cancelJob}
          onPremium={premiumGate}
        />
      )}

      <ImportSourceSheet start={start} onContinue={() => { start.close(); refreshAll(); }} continueLabel={T.done} onAddAnother={() => { start.addAnother(); setAdding(true); }} />
    </>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  group: { marginBottom: spacing.xl, paddingHorizontal: spacing.xl },
  groupTitle: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.7, textTransform: 'uppercase', color: colors.textSecondary, marginBottom: spacing.sm },
  groupCard: { borderRadius: radii.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  foot: { marginTop: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted },
  running: { marginHorizontal: spacing.xl, marginBottom: spacing.md },
  runningCancel: { alignSelf: 'flex-end', marginTop: -spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  rowHint: { flexShrink: 1, fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textSecondary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  statusLine: { flexShrink: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary },
  plus: { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  plusText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.lg, color: colors.textSecondary },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 22, paddingHorizontal: 8, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken },
  chipRun: { backgroundColor: colors.accentDim },
  chipOk: { backgroundColor: colors.successDim },
  chipWarn: { backgroundColor: colors.highlight },
  chipBad: { backgroundColor: colors.dangerDim },
  chipOff: { backgroundColor: colors.surfaceSunken },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.accent },
  chipMark: { fontFamily: fontFamily.sansBold, fontSize: 10, color: colors.textPrimary },
  chipText: { fontFamily: fontFamily.sansBold, fontSize: 11, color: colors.textPrimary },
  empty: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyLogos: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.xs },
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.3, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xs },
  smallButton: { height: 32, paddingHorizontal: 12, borderRadius: radii.pill, backgroundColor: colors.textPrimary, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.bg },
  smallButtonSecondary: { height: 32, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  smallButtonSecondaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary },
  linkText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textSecondary, paddingVertical: 4 },
  detail: { gap: spacing.md },
  card: { borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, overflow: 'hidden' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  label: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted, marginTop: -spacing.sm },
  hintCenter: { textAlign: 'center', marginTop: 0 },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger },
  emptyLine: { padding: spacing.md, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  histRow: { gap: 4, padding: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  histHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  histWhen: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  histLine: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textSecondary },
  histActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap' },
  cta: { height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.textPrimary },
  ctaOff: { opacity: 0.5 },
  ctaText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.bg },
  removeLink: { alignSelf: 'center', paddingVertical: spacing.xs },
  removeText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.danger },
});
