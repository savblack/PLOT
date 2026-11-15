/**
 * The empty-library nudge on Home (@plot/core/activationNudge.js): "Add your
 * first show or movie" opens Search, and one button per confirmed import
 * source opens that source's import sheet. Shown while the account has no
 * titles in its watchlist, watching or history; it goes at the first title.
 * Same rule and words as web (ActivationNudge.jsx).
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { activationNudgeSources, shouldShowActivationNudge } from '@plot/core/activationNudge.js';
import { ACTIVATION_NUDGE as T } from '@plot/core/copy/activationNudge.js';
import { getConfig } from '@plot/core/config.js';
import { useAppData } from '../contexts/AppDataContext';
import ImportSourceIcon from './ImportSourceIcon';
import { useTheme } from '../contexts/ThemeContext';
import { track, EVENTS } from '../lib/analytics';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

/** Whether Home should draw the nudge in the checklist's place. */
export function useActivationNudgeVisible() {
  const { userId, watchlist, watching, history } = useAppData();
  const ready = !!userId && !watchlist.loading && !watching.loading && !history.loading
    && !watchlist.error && !watching.error;
  return shouldShowActivationNudge({
    ready,
    watchlistCount: watchlist.items?.length ?? 0,
    watchingCount: watching.items?.length ?? 0,
    historyCount: history.loading ? null : (history.entries?.length ?? 0),
  });
}

export default function ActivationNudge({ onImport }: { onImport: (sourceId: string) => void }) {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const sources = activationNudgeSources(getConfig());
  const shown = useRef(false);
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    track(EVENTS.ACTIVATION_NUDGE_SHOWN, { surface: 'home' });
  }, []);

  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">{T.title}</Text>
      <Text style={styles.body}>{T.body}</Text>
      <TouchableOpacity
        style={styles.primary}
        onPress={() => { track(EVENTS.ACTIVATION_NUDGE_ADD_CLICKED, { surface: 'home' }); router.push('/(app)/search' as Href); }}
        accessibilityRole="button"
      >
        <Text style={styles.primaryText}>{T.add}</Text>
      </TouchableOpacity>
      {sources.length > 0 && (
        <View style={styles.import}>
          <Text style={styles.importTitle}>{T.importTitle}</Text>
          <Text style={styles.body}>{T.importBody}</Text>
          <View style={styles.sources}>
            {sources.map(src => (
              <TouchableOpacity
                key={src.id}
                style={styles.source}
                onPress={() => { track(EVENTS.ACTIVATION_NUDGE_IMPORT_CLICKED, { surface: 'home', source: src.id }); onImport(src.id); }}
                accessibilityRole="button"
                accessibilityLabel={T.importFrom(src.name)}
              >
                <ImportSourceIcon id={src.id} name={src.name} size={26} />
                <Text style={styles.sourceText}>{src.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { marginHorizontal: spacing.xl, marginBottom: spacing.xl, padding: spacing.lg, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.lg, letterSpacing: -0.34, color: colors.textPrimary },
  body: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 19, color: colors.textSecondary },
  primary: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.accentFill, marginTop: spacing.xs },
  primaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.onAccentFill },
  import: { gap: spacing.xs, marginTop: spacing.sm, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  importTitle: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  sources: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  source: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingLeft: spacing.sm, paddingRight: spacing.lg, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface },
  sourceText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
});
