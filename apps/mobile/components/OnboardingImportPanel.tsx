/**
 * Onboarding's "Switching apps?" branch, once a source is picked: the import
 * starts right here. An export file is uploaded and queued, or an account is
 * connected and queued, and the import-worker carries on in the background
 * while setup continues (packages/core/importJobs.js). Home shows the
 * progress. Mirrors web's ImportPanel in apps/web/src/pages/OnboardingScreen.jsx.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { IMPORT_SOURCES } from '@plot/core/onboardingSetup.js';
import { IMPORT_ENTRY_POINTS, createImportReporter } from '@plot/core/importPipeline.js';
import { startFileImport, startConnectionImport, CONNECTION_SOURCES } from '@plot/core/importJobs.js';
import { usePlexSource } from '@plot/core/usePlexSource.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useOnboardingFlow } from '../contexts/OnboardingFlowContext';
import { useAppData } from '../contexts/AppDataContext';
import { useTraktSync } from '../hooks/useTraktSync';
import { useMediaSync } from '../hooks/useMediaSync';

const I = IMPORT_JOBS.onboarding;
export type ImportPhase = 'file' | 'uploading' | 'connect' | 'connecting' | 'ready' | 'starting' | 'queued';

// What each file source's picker accepts, and the words for it.
const FILE_TYPES: Record<string, string[]> = {
  letterboxd: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', 'application/zip', 'text/plain'],
  netflix: ['text/csv', 'text/comma-separated-values', 'public.comma-separated-values-text', 'text/plain'],
};
const FILE_FORMATS: Record<string, string> = { letterboxd: 'CSV or ZIP', netflix: 'CSV' };
// While the system browser has the Trakt sign-in, ask whether it landed.
const CONNECT_POLL_MS = 3000;

interface Props {
  source: string;
  /** The job is queued (or was already): the step's Continue can show. */
  onQueued: () => void;
}

export default function OnboardingImportPanel({ source, onQueued }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const flow = useOnboardingFlow();
  const { user } = useAppData();
  const userId = user?.id ?? null;
  const trakt = useTraktSync(userId);
  const plex = useMediaSync(userId);
  const plexSource = usePlexSource(userId, { autoPick: true });

  const isConnection = CONNECTION_SOURCES.includes(source);
  const connection = source === 'trakt' ? trakt : source === 'plex' ? plex : null;
  const connected = !!connection?.isConnected;
  const [phase, setPhase] = useState<ImportPhase>(() => (flow.importJob ? 'queued' : isConnection ? (connection?.isConnected ? 'ready' : 'connect') : 'file'));
  const [error, setError] = useState<string | null>(null);

  const loadTrakt = trakt.loadIntegration;
  const loadPlex = plex.loadIntegration;
  useEffect(() => {
    if (!userId || !isConnection) return;
    loadTrakt();
    loadPlex();
  }, [userId, isConnection, loadTrakt, loadPlex]);
  useEffect(() => {
    if (connected && (phase === 'connect' || phase === 'connecting')) setPhase('ready');
  }, [connected, phase]);
  // Plex needs a server and profile; load the list as soon as it is connected.
  // The hook picks the only server and only profile itself.
  const plexChoose = plexSource.choose;
  const plexListed = !!plexSource.servers;
  useEffect(() => {
    if (source === 'plex' && connected && !plexListed) void plexChoose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- choose is recreated every render; the listed flag is the guard
  }, [source, connected, plexListed]);
  // Trakt comes back through a deep link the root layout exchanges; poll the
  // row until it says active.
  useEffect(() => {
    if (phase !== 'connecting' || source !== 'trakt') return undefined;
    const id = setInterval(() => { loadTrakt(); }, CONNECT_POLL_MS);
    return () => clearInterval(id);
  }, [phase, source, loadTrakt]);
  useEffect(() => { if (phase === 'queued') onQueued(); }, [phase, onQueued]);

  const pickFile = useCallback(async () => {
    if (!userId || phase !== 'file') return;
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: FILE_TYPES[source] ?? '*/*', copyToCacheDirectory: true, multiple: source === 'letterboxd' });
      if (result.canceled || !result.assets?.[0]) return;
      setPhase('uploading');
      setError(null);
      const files = [];
      for (const asset of result.assets) {
        const file = new FileSystem.File(asset.uri);
        files.push({ name: asset.name, body: new Uint8Array(await file.arrayBuffer()), contentType: asset.mimeType || undefined });
      }
      const { job, error: startError } = await startFileImport({ userId, source, entry: IMPORT_ENTRY_POINTS.ONBOARDING, files });
      if (startError || !job) { setError(startError?.message ?? I.uploadFailed); setPhase('file'); return; }
      createImportReporter({ entry: IMPORT_ENTRY_POINTS.ONBOARDING }).report('started', { source, count: 0 });
      flow.setImportJob({ id: job.id });
      setPhase('queued');
    } catch (e) {
      setError(e instanceof Error ? e.message : I.uploadFailed);
      setPhase('file');
    }
  }, [userId, source, phase, flow]);

  const connect = useCallback(async () => {
    setPhase('connecting');
    if (source === 'plex') {
      const result = await plex.startPlexAuth();
      if (!result) setPhase('connect');
      return;
    }
    await trakt.connect();
  }, [source, plex, trakt]);

  const startImport = useCallback(async () => {
    if (phase !== 'ready') return;
    setPhase('starting');
    setError(null);
    const { job, error: startError } = await startConnectionImport({ source, entry: IMPORT_ENTRY_POINTS.ONBOARDING });
    if (startError || !job) { setError(startError?.message ?? I.uploadFailed); setPhase('ready'); return; }
    createImportReporter({ entry: IMPORT_ENTRY_POINTS.ONBOARDING }).report('started', { source, count: 0 });
    flow.setImportJob({ id: job.id });
    setPhase('queued');
  }, [source, phase, flow]);

  const name = IMPORT_SOURCES.find(s => s.id === source)?.name ?? source;
  const showPlex = source === 'plex' && connected;
  const plexReady = !showPlex || !!plexSource.selected;

  if (phase === 'queued') {
    return (
      <View style={[styles.panel, styles.panelDone]} accessibilityLiveRegion="polite">
        <Text style={styles.panelTitle}>{I.queued(name)}</Text>
        <Text style={styles.panelBody}>{I.queuedBody}</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {(error || connection?.error) ? <Text style={styles.error}>{error || connection?.error}</Text> : null}
      {(phase === 'file' || phase === 'uploading') && (
        <TouchableOpacity style={styles.drop} onPress={pickFile} disabled={phase === 'uploading'} accessibilityRole="button" accessibilityState={{ busy: phase === 'uploading' }}>
          {phase === 'uploading' ? <ActivityIndicator color={colors.accent} /> : null}
          <Text style={styles.dropTitle}>{phase === 'uploading' ? I.uploading : I.chooseFile}</Text>
          <Text style={styles.dropHint}>{I.chooseFileHint(FILE_FORMATS[source] ?? 'CSV, JSON or ZIP')}</Text>
        </TouchableOpacity>
      )}
      {phase === 'connect' && (
        <TouchableOpacity style={styles.button} onPress={connect} accessibilityRole="button"><Text style={styles.buttonText}>{I.connect(name)}</Text></TouchableOpacity>
      )}
      {phase === 'connecting' && (
        <View style={styles.wait}><ActivityIndicator color={colors.accent} /><Text style={styles.panelBody}>{I.connecting}</Text></View>
      )}
      {(phase === 'ready' || phase === 'starting') && (
        <>
          <Text style={styles.panelTitle}>{I.connected(name)}</Text>
          {showPlex && (
            <View style={styles.chips}>
              {(plexSource.servers || []).map(server => (
                <TouchableOpacity key={server.clientIdentifier} style={[styles.chip, plexSource.serverId === server.clientIdentifier && styles.chipOn]} disabled={plexSource.busy} onPress={() => plexSource.choose(server.clientIdentifier)}>
                  <Text style={styles.chipText}>{server.name}</Text>
                </TouchableOpacity>
              ))}
              {(plexSource.profiles || []).map(profile => (
                <TouchableOpacity key={profile.accountID} style={styles.chip} disabled={plexSource.busy} onPress={() => plexSource.choose(plexSource.serverId, profile.accountID)}>
                  <Text style={styles.chipText}>{profile.name}</Text>
                </TouchableOpacity>
              ))}
              {plexSource.selected && plexSource.selection ? <Text style={styles.panelBody}>{I.plexPicked(plexSource.selection.name, plexSource.selection.profileName)}</Text> : null}
              {!plexSource.selected && !plexSource.busy && <Text style={styles.panelBody}>{I.plexServerLater}</Text>}
              {plexSource.error ? <Text style={styles.error}>{plexSource.error}</Text> : null}
            </View>
          )}
          <TouchableOpacity style={[styles.button, (phase === 'starting' || !plexReady) && styles.buttonOff]} disabled={phase === 'starting' || !plexReady} onPress={startImport} accessibilityRole="button">
            <Text style={styles.buttonText}>{I.startImport}</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  panel: { marginTop: spacing.md, padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  panelDone: { backgroundColor: colors.accentSecondaryDim, borderColor: 'transparent', alignItems: 'center' },
  panelTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary, textAlign: 'center' },
  panelBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary, textAlign: 'center' },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, textAlign: 'center' },
  drop: { minHeight: 120, padding: spacing.md, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surfaceSunken },
  dropTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  dropHint: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
  wait: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  button: { height: 48, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.textPrimary },
  buttonOff: { opacity: 0.5 },
  buttonText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.bg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'center' },
  chip: { height: 32, paddingHorizontal: 12, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface, justifyContent: 'center' },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  chipText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
});
