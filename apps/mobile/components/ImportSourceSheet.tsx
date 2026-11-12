/**
 * The per-source bottom sheet that starts a background import: export steps
 * and the file picker for a file source, what gets read and the connect
 * button for an account, then the "got it" state. State comes from
 * hooks/useImportStart.ts; onboarding and Settings both render this. Mirrors
 * apps/web/src/components/ImportSourceDialog.jsx.
 */
import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { findImportSource } from '@plot/core/onboardingSetup.js';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { IMPORT_JOBS } from '@plot/core/copy/importJobs.js';
import { COMMON } from '@plot/core/copy/common.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import type { ImportStart, PlexPickerState } from '../hooks/useImportStart';
import BottomSheet from './BottomSheet';
import Button, { TextLink } from './Button';
import ImportSourceIcon from './ImportSourceIcon';
import { Tag } from './Chip';
import { Spinner } from './Loader';

const S = ONBOARDING_FLOW.importSources;
const I = IMPORT_JOBS.onboarding;

/**
 * The sheet the import surfaces share (source, add a source, source detail):
 * the app's BottomSheet with a title (plain, or a source's logo and name),
 * an optional line under it, and the body.
 */
export function ImportSheet({ title, sub, onClose, children }: {
  title: ReactNode; sub?: string; onClose: () => void; children: ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <BottomSheet visible onClose={onClose} title={typeof title === 'string' ? title : undefined}>
      {typeof title === 'string' ? null : title}
      {sub ? <Text style={styles.sheetSub}>{sub}</Text> : null}
      {children}
    </BottomSheet>
  );
}

/** A source's name beside its logo, for a sheet title. */
export function SourceTitle({ id, name }: { id: string; name: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sourceTitle}>
      <ImportSourceIcon id={id} name={name} size={28} />
      <Text style={styles.sheetTitle} accessibilityRole="header">{name}</Text>
    </View>
  );
}

function CheckIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12l5 5 9-10" />
    </Svg>
  );
}

function UploadIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 16V4M7 9l5-5 5 5" /><Path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2" />
    </Svg>
  );
}

function LockIcon({ color }: { color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={5} y={11} width={14} height={10} rx={2} /><Path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </Svg>
  );
}

/** Server then profile, as radio lists. Shared with the Settings source detail. */
export function PlexPicker({ plex }: { plex: PlexPickerState }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const radio = (on: boolean, key: string, label: string, note: string | null, onPress: () => void) => (
    <TouchableOpacity key={key} style={[styles.radio, on && styles.radioOn]} disabled={plex.busy} onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: on, disabled: plex.busy }}>
      <View style={[styles.radioDot, on && styles.radioDotOn]} />
      <Text style={styles.radioText}>{label}</Text>
      {note ? <Text style={styles.radioNote}>{note}</Text> : null}
    </TouchableOpacity>
  );
  return (
    <View style={{ gap: spacing.sm }}>
      {plex.servers.length > 0 && (
        <>
          <Text style={styles.label}>{I.plexServer}</Text>
          <View style={styles.radios} accessibilityRole="radiogroup" accessibilityLabel={I.plexServer}>
            {plex.servers.map(server => radio(plex.serverId === server.clientIdentifier, server.clientIdentifier, server.name, server.owned == null ? null : server.owned ? I.plexOwned : I.plexShared, () => { void plex.choose(server.clientIdentifier); }))}
          </View>
        </>
      )}
      {plex.profiles.length > 0 && (
        <>
          <Text style={styles.label}>{I.plexProfile}</Text>
          <View style={styles.radios} accessibilityRole="radiogroup" accessibilityLabel={I.plexProfile}>
            {plex.profiles.map(profile => radio(plex.selection?.profileName === profile.name, profile.accountID, profile.name, null, () => { void plex.choose(plex.serverId || '', profile.accountID); }))}
          </View>
        </>
      )}
      {plex.selected && plex.selection ? <Text style={styles.bodyText}>{I.plexSelected(plex.selection.name, plex.selection.profileName)}</Text> : null}
      {!plex.selected && !plex.busy && plex.servers.length === 0 ? <Text style={styles.bodyText}>{I.plexServerLater}</Text> : null}
      {plex.busy ? <View style={styles.wait}><Spinner /><Text style={styles.bodyText}>{COMMON.loading}</Text></View> : null}
      {plex.error ? <Text style={styles.error}>{plex.error}</Text> : null}
    </View>
  );
}

function ReadsList({ id }: { id: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const reads = (S.reads as Record<string, string[]>)[id] || [];
  const not = (S.readsNot as Record<string, string>)[id];
  return (
    <View style={styles.reads}>
      {reads.map(line => (
        <View key={line} style={styles.readsRow}><CheckIcon color={colors.success} /><Text style={styles.readsText}>{line}</Text></View>
      ))}
      {not ? <View style={styles.readsRow}><Text style={styles.readsDash}>–</Text><Text style={[styles.readsText, styles.readsNot]}>{not}</Text></View> : null}
    </View>
  );
}

interface Props {
  start: ImportStart;
  onContinue: () => void;
  continueLabel?: string;
  onAddAnother?: () => void;
}

export default function ImportSourceSheet({ start, onContinue, continueLabel = I.continue, onAddAnother }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const src = findImportSource(start.source);
  if (!src || start.phase === 'pick') return null;
  const name = src.name;
  const { phase, plex, pendingFiles } = start;
  const cta = (label: string, onPress: () => void, disabled = false, centered = false) => (
    <Button variant="primary" label={label} onPress={onPress} disabled={disabled} style={centered ? styles.centered : undefined} />
  );
  const link = (label: string, onPress: () => void) => (
    <TextLink quiet label={label} onPress={onPress} style={styles.centered} />
  );

  let body: ReactNode;
  if (phase === 'queued') {
    body = (
      <View style={styles.done} accessibilityLiveRegion="polite">
        <View style={styles.doneCheck}><CheckIcon color={colors.bg} size={22} /></View>
        <Text style={styles.doneTitle}>{start.queuedBehind ? I.queuedBehind(name, start.queuedBehind) : I.queued(name)}</Text>
        <Text style={styles.bodyText}>{I.queuedBody}</Text>
        {cta(continueLabel, onContinue, false, true)}
        {onAddAnother ? link(I.addAnother, onAddAnother) : null}
      </View>
    );
  } else if (src.lane === 'upload') {
    const ready = !!pendingFiles?.length;
    const uploading = phase === 'uploading';
    const noRatings = src.noRatings ? (S.noRatings as Record<string, string>)[src.id] : null;
    body = (
      <View style={styles.stack}>
        <Text style={styles.lead}>{src.hint}{noRatings ? ` ${noRatings}` : ''}</Text>
        {start.error ? <Text style={styles.error}>{start.error}</Text> : null}
        {ready && !uploading ? (
          <View style={[styles.drop, styles.dropReady]} accessibilityLiveRegion="polite">
            <CheckIcon color={colors.success} size={22} />
            <Text style={styles.dropTitle}>{S.fileReady(pendingFiles!.map(f => f.name).join(', '), start.pendingRows)}</Text>
            {link(S.changeFile, start.clearFile)}
          </View>
        ) : (
          <TouchableOpacity style={styles.drop} onPress={() => { void start.chooseFile(); }} disabled={uploading} accessibilityRole="button" accessibilityState={{ busy: uploading, disabled: uploading }}>
            {uploading ? <Spinner /> : <UploadIcon color={colors.textSecondary} />}
            <Text style={styles.dropTitle}>{uploading ? I.uploading : S.dropTitle}</Text>
            <Text style={styles.dropHint}>{S.dropFormats(src.formats)}</Text>
          </TouchableOpacity>
        )}
        {ready && !uploading && start.listChoiceNeeded ? (
          <View style={{ gap: spacing.sm }}>
            <Text style={styles.label}>{I.imdbListQuestion}</Text>
            <View style={styles.radios} accessibilityRole="radiogroup" accessibilityLabel={I.imdbListQuestion}>
              {([['watchlist', I.imdbListWatchlist, I.imdbListWatchlistNote], ['list', I.imdbListOther, I.imdbListOtherNote]] as const).map(([id, label, note]) => {
                const on = start.listChoice === id;
                return (
                  <TouchableOpacity key={id} style={[styles.radio, on && styles.radioOn]} onPress={() => start.chooseList(id)} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                    <View style={[styles.radioDot, on && styles.radioDotOn]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.radioText}>{label}</Text>
                      <Text style={styles.radioNote}>{note}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
        {src.steps ? (
          <View style={styles.steps}>
            {src.steps.map((step, i) => (
              <View key={step} style={styles.step}>
                <View style={styles.stepNum}><Text style={styles.stepNumText}>{i + 1}</Text></View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <View style={styles.privacy}><LockIcon color={colors.textMuted} /><Text style={styles.privacyText}>{src.noRatings ? S.privacyNoRatings : S.privacy}</Text></View>
        {cta(uploading ? I.uploading : S.importRows(start.pendingRows), () => { void start.upload(); }, !ready || uploading || (start.listChoiceNeeded && !start.listChoice))}
      </View>
    );
  } else if (phase === 'connect') {
    body = (
      <View style={styles.stack}>
        {start.error ? <Text style={styles.error}>{start.error}</Text> : null}
        <ReadsList id={src.id} />
        {cta(S.continueTo(name), () => { void start.connect(); })}
      </View>
    );
  } else if (phase === 'connecting') {
    body = (
      <View style={styles.stack}>
        <View style={styles.wait}><Spinner /><Text style={styles.bodyText}>{I.connecting}</Text></View>
        {link(S.openAgain, () => { void start.connect(); })}
      </View>
    );
  } else {
    // 'ready' | 'starting'
    const starting = phase === 'starting';
    body = (
      <View style={styles.stack}>
        {start.error ? <Text style={styles.error}>{start.error}</Text> : null}
        <View style={styles.status}>
          <Tag tone="sage" label={S.tileConnected} icon={<CheckIcon color={colors.onAccentSecondaryFill} size={14} />} style={styles.centered} />
          {start.connectedAs ? <Text style={styles.bodyText}>{I.connectedAs(start.connectedAs)}</Text> : null}
        </View>
        {plex ? <PlexPicker plex={plex} /> : null}
        {cta(starting ? I.starting : plex ? I.startPlexImport : I.startImport, () => { void start.startJob(); }, starting || (!!plex && !plex.selected))}
      </View>
    );
  }

  return (
    <ImportSheet title={<SourceTitle id={src.id} name={name} />} onClose={start.busy ? () => {} : start.close}>
      {body}
    </ImportSheet>
  );
}

export const makeStyles = (colors: Palette) => StyleSheet.create({
  sourceTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  sheetTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, letterSpacing: -0.4, color: colors.textPrimary, flexShrink: 1 },
  sheetSub: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary },
  stack: { gap: spacing.md },
  lead: { fontFamily: fontFamily.sans, fontSize: fontSize.md, lineHeight: 22, color: colors.textPrimary },
  bodyText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger },
  drop: { minHeight: 120, padding: spacing.md, gap: 4, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, backgroundColor: colors.surfaceSunken },
  dropReady: { borderStyle: 'solid', borderColor: colors.successBorder, backgroundColor: colors.successDim },
  dropTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary, textAlign: 'center' },
  dropHint: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary, textAlign: 'center' },
  steps: { gap: spacing.sm },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  stepNum: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  stepNumText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary },
  stepText: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 20, color: colors.textSecondary },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  privacyText: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted },
  reads: { gap: spacing.sm },
  readsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  readsText: { flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.md, lineHeight: 22, color: colors.textPrimary },
  readsNot: { color: colors.textSecondary },
  readsDash: { width: 18, textAlign: 'center', fontFamily: fontFamily.sans, fontSize: fontSize.md, lineHeight: 22, color: colors.textMuted },
  wait: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  label: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textSecondary },
  radios: { gap: spacing.xs },
  radio: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  radioDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong },
  radioDotOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  radioText: { flex: 1, fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  radioNote: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  done: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  doneCheck: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  doneTitle: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.3, color: colors.textPrimary, textAlign: 'center' },
  centered: { alignSelf: 'center' },
});
