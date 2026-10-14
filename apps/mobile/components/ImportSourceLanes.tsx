/**
 * The two lanes of import sources (Connect an account, Upload an export) as
 * logo tiles, and the one-line progress pill that follows a pick. Shared by
 * onboarding's switching-apps step and Settings › Connections › Add a source.
 * Mirrors apps/web/src/components/ImportSourceLanes.jsx (without the
 * desktop-only drop-on-tile).
 */
import { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { availableImportSources, type ImportSource } from '@plot/core/onboardingSetup.js';
import { importTileState } from '@plot/core/importJobs.js';
import { getConfig } from '@plot/core/config.js';
import { ONBOARDING_FLOW } from '@plot/core/copy/onboardingFlow.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import ImportSourceIcon from './ImportSourceIcon';

const S = ONBOARDING_FLOW.importSources;

type TileState = 'importing' | 'queued' | 'connected' | null;

function SourceTile({ src, state, onPick, styles }: { src: ImportSource; state: TileState; onPick: (id: string) => void; styles: ReturnType<typeof makeStyles> }) {
  const held = state === 'importing' || state === 'queued';
  const label = state === 'importing' ? S.tileImporting : state === 'queued' ? S.tileQueued : state === 'connected' ? S.tileConnected : src.name;
  return (
    <TouchableOpacity
      style={[styles.tile, held && styles.tileHeld, state === 'connected' && styles.tileConnected]}
      disabled={held}
      onPress={() => onPick(src.id)}
      accessibilityRole="button"
      accessibilityState={{ selected: !!state, disabled: held }}
      accessibilityLabel={state ? `${src.name}: ${label}` : `${src.name}. ${src.hint}`}
    >
      <ImportSourceIcon id={src.id} name={src.name} size={34} />
      <Text style={[styles.tileName, !!state && styles.tileNameState]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

interface Props {
  jobs: { source: string; status: string; id: string }[];
  current: { id: string } | null;
  connectedIds?: string[];
  onPick: (id: string) => void;
}

export default function ImportSourceLanes({ jobs, current, connectedIds = [], onPick }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sources = availableImportSources(getConfig());
  const lane = (key: 'connect' | 'upload') => sources.filter(src => src.lane === key);
  return (
    <View style={styles.lanes} accessibilityLabel={S.sourcesLabel}>
      <View style={styles.lane}>
        <Text style={styles.laneTitle} accessibilityRole="header">{S.connectLane}</Text>
        <Text style={styles.laneHint}>{S.connectLaneHint}</Text>
        <View style={styles.tiles}>
          {lane('connect').map(src => {
            const held = importTileState(jobs, current, src.id) as TileState;
            return <SourceTile key={src.id} src={src} state={held || (connectedIds.includes(src.id) ? 'connected' : null)} onPick={onPick} styles={styles} />;
          })}
        </View>
      </View>
      <View style={styles.lane}>
        <Text style={styles.laneTitle} accessibilityRole="header">{S.uploadLane}</Text>
        <Text style={styles.laneHint}>{S.uploadLaneHint}</Text>
        <View style={styles.tiles}>
          {lane('upload').map(src => (
            <SourceTile key={src.id} src={src} state={importTileState(jobs, current, src.id) as TileState} onPick={onPick} styles={styles} />
          ))}
        </View>
      </View>
    </View>
  );
}

/** The one-line import progress shown above whatever follows a pick. */
export function ImportPill({ pill }: { pill: { source: string; name: string; title: string; line: string; pct: number | null } | null }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!pill) return null;
  return (
    <View style={styles.pill} accessibilityLiveRegion="polite" accessibilityLabel={`${pill.title}. ${pill.line}`}>
      <ImportSourceIcon id={pill.source} name={pill.name} size={22} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.pillRow}>
          <Text style={styles.pillTitle} numberOfLines={1}>{pill.title}</Text>
          <Text style={styles.pillLine} numberOfLines={1}>{pill.line}</Text>
        </View>
        <View style={styles.pillBar}><View style={[styles.pillFill, { width: pill.pct == null ? '35%' : `${pill.pct}%` }]} /></View>
      </View>
    </View>
  );
}

// Three tiles a row at the onboarding card width; the tile grows to fill.
const makeStyles = (colors: Palette) => StyleSheet.create({
  lanes: { gap: spacing.lg },
  lane: { gap: 2 },
  laneTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  laneHint: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary, marginBottom: spacing.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  tile: { width: '31%', flexGrow: 1, maxWidth: '32%', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.xs, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  tileHeld: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  tileConnected: { borderColor: colors.successBorder, backgroundColor: colors.successDim },
  tileName: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, color: colors.textPrimary },
  tileNameState: { fontFamily: fontFamily.sansBold },
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, paddingRight: spacing.md, marginBottom: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pillRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  pillTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary, flexShrink: 1 },
  pillLine: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary, flexShrink: 1, fontVariant: ['tabular-nums'] },
  pillBar: { height: 4, borderRadius: radii.pill, backgroundColor: colors.surfaceSunken, overflow: 'hidden' },
  pillFill: { height: '100%', borderRadius: radii.pill, backgroundColor: colors.accent },
});
