// Where to watch prompt for a film with no offer in the viewer's region.
// Mirrors apps/web/src/components/StreamingArrivalAsk.jsx. The watchlist save
// is the opt-in the daily streaming-arrival job already reads. TV has no
// equivalent alert, so MediaPanel only mounts this for a movie.
import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { enableStreamingArrivalAlert } from '@plot/core/useStreamingAlerts.js';
import { STREAMING_ALERTS as A } from '@plot/core/copy/streamingAlerts.js';
import { COMMON } from '@plot/core/copy/common.js';
import { track, EVENTS } from '../lib/analytics';
import { fontFamily, fontSize, spacing, radii, type Palette } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

type Movie = { id: number; title?: string };

export default function StreamingArrivalAsk({
  userId,
  movie,
  inList,
  onAdd,
}: {
  userId: string | null | undefined;
  movie: Movie;
  inList: boolean;
  onAdd: () => Promise<unknown>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!userId || !movie?.id || !movie.title) return null;

  const onAsk = async () => {
    if (busy || armed) return;
    setBusy(true);
    setFailed(false);
    try {
      if (!inList) {
        const saved = await onAdd();
        if (!saved) {
          setFailed(true);
          return;
        }
      }
      const result = await enableStreamingArrivalAlert(userId, movie);
      if (!result.ok) {
        setFailed(true);
        return;
      }
      setArmed(true);
      track(EVENTS.STREAMING_ARRIVAL_REQUESTED, {
        tmdb_id: Number(movie.id),
        added_to_watchlist: !inList,
      });
    } finally {
      setBusy(false);
    }
  };

  if (armed) return <Text style={styles.armed}>{A.ask.armed}</Text>;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => { void onAsk(); }}
        disabled={busy}
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        accessibilityLabel={A.ask.prompt}
        style={[styles.pill, busy && styles.busy]}
      >
        <Text style={styles.pillText}>{busy ? COMMON.saving : A.ask.prompt}</Text>
      </TouchableOpacity>
      {failed ? <Text style={styles.error} accessibilityRole="alert">{A.error}</Text> : null}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  wrap: { alignItems: 'flex-start', marginTop: spacing.sm, marginBottom: spacing.md, gap: spacing.sm },
  pill: {
    alignSelf: 'flex-start',
    minHeight: 36,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  pillText: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary },
  busy: { opacity: 0.45 },
  armed: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
    fontFamily: fontFamily.sans,
    fontSize: fontSize.xs,
    lineHeight: 18,
    color: colors.textMuted,
  },
  error: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
});
