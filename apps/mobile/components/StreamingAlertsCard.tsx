// Streaming alerts on a film that is on your watchlist (title panel). Mirrors
// apps/web/src/components/StreamingAlertsCard.jsx. Free, in the app and
// automatic: the watchlist is the opt-in, so this card only shows once the film
// is on it, and what it offers is a way out (mute this film), not a way in.
// Turning the whole thing off lives in Settings > Viewing; if it is off, one tap
// here puts it back.
//
// Logic and copy are shared with web (@plot/core useStreamingAlerts.js and
// copy/streamingAlerts.js). Detection and delivery happen server-side in the
// streaming-arrival-alerts Edge Function.
import { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useStreamingAlertMute, useStreamingAlertsSwitch } from '@plot/core/useStreamingAlerts.js';
import { STREAMING_ALERTS as A } from '@plot/core/copy/streamingAlerts.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';

// The same bell as web's BellIcon: filled when alerts are on, outline when off.
function BellIcon({ on, color }: { on: boolean; color: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={on ? color : 'none'} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </Svg>
  );
}

/** `movie` is TMDB movie details. Render this only when the film is on the watchlist. */
export default function StreamingAlertsCard({ movie }: { movie: { id: number; title?: string } }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { userId, profile } = useAppData();
  const mute = useStreamingAlertMute(userId, movie);
  const all = useStreamingAlertsSwitch(userId);

  // Nothing until both reads land, so the card never flashes the wrong state.
  if (!userId || !movie?.id || !movie?.title || mute.loading || all.loading) return null;

  const hasServices = (profile?.streaming_providers?.length ?? 0) > 0;
  const failed = mute.error || all.error;
  let hint: string = hasServices ? A.card.hint : A.card.hintNoServices;
  let action;
  if (!all.on) {
    hint = A.card.switchedOff;
    action = (
      <TouchableOpacity
        onPress={() => { void all.setOn(true); }}
        disabled={all.busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: all.busy }}
        accessibilityLabel={A.card.turnOnAllLabel}
        style={[styles.pill, all.busy && styles.busy]}
      >
        <BellIcon on={false} color={colors.textPrimary} />
        <Text style={styles.pillText}>{A.card.turnOnAll}</Text>
      </TouchableOpacity>
    );
  } else {
    if (mute.muted) hint = A.card.muted;
    const on = !mute.muted;
    action = (
      <TouchableOpacity
        onPress={() => { void mute.toggle(); }}
        disabled={mute.busy}
        accessibilityRole="button"
        accessibilityState={{ selected: on, disabled: mute.busy }}
        accessibilityLabel={on ? A.card.muteLabel : A.card.unmuteLabel}
        style={[styles.pill, mute.busy && styles.busy]}
      >
        <BellIcon on={on} color={on ? colors.accentText : colors.textPrimary} />
        <Text style={[styles.pillText, on && { color: colors.accentText }]}>{on ? A.card.on : A.card.off}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>{A.card.title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
        {action}
      </View>
      {failed ? <Text style={styles.error} accessibilityRole="alert">{A.error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.surface, paddingVertical: spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontFamily: fontFamily.displaySemi, fontSize: fontSize.lg, color: colors.textPrimary },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, lineHeight: 16, color: colors.textMuted },
  // The same pill as FollowPill (components/people/FollowControls.tsx).
  pill: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  pillText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  busy: { opacity: 0.45 },
  error: { marginTop: spacing.sm, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
});
