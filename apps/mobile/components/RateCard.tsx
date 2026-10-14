/**
 * Home's rate card: "How was X?" for the most recent title marked watched
 * without a rating, for up to three days (@plot/core/ratePrompt.js). One row,
 * poster, question, five stars. A star rates in place; the poster opens the
 * title; "Not now" stops asking about that title on this device.
 */
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ratePromptCandidate, daysSinceWatched, watchedAgoLabel } from '@plot/core/ratePrompt.js';
import { ratingToStars } from '@plot/core/ratings.js';
import { RATE_PROMPT } from '@plot/core/copy/ratePrompt.js';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { useMediaPanel } from '../contexts/MediaPanelContext';
import { Palette, fontFamily, fontSize, posterUrl, radii, spacing } from '../lib/tokens';
import { cancelRateReminder, dismissRatePrompt, readDismissedRatePrompts } from '../lib/ratePrompt';
import Stars from './Stars';

type Entry = { tmdb_id: number; media_type: string; title?: string; poster_path?: string | null; rating?: number | null; dnf?: boolean; note?: string | null; watched_at?: string | null };

export default function RateCard({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { history } = useAppData();
  const { open } = useMediaPanel();
  const [dismissed, setDismissed] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [justRated, setJustRated] = useState(0);

  useEffect(() => {
    let alive = true;
    readDismissedRatePrompts(userId).then(set => { if (alive) setDismissed(set); });
    return () => { alive = false; };
  }, [userId]);

  const entry: Entry | null = useMemo(
    () => (dismissed ? ratePromptCandidate(history.entries ?? [], { dismissed }) : null),
    [history.entries, dismissed],
  );

  // The confirmation holds for a beat after a rating, then the card goes
  // (the entry now has a rating, so the candidate moves on or becomes null).
  useEffect(() => {
    if (!justRated) return;
    const t = setTimeout(() => setJustRated(0), 1200);
    return () => clearTimeout(t);
  }, [justRated]);

  if (!entry && !justRated) return null;

  const mediaType = (entry?.media_type === 'tv' ? 'tv' : 'movie') as 'movie' | 'tv';

  const pick = async (value: number) => {
    if (!entry || busy) return;
    setBusy(true);
    const ok = await history.updateEntry(entry.tmdb_id, {
      rating: value, note: entry.note ?? null, dnf: !!entry.dnf, watched_at: entry.watched_at,
    }, mediaType);
    setBusy(false);
    if (ok) {
      setJustRated(value);
      void cancelRateReminder({ tmdbId: entry.tmdb_id, mediaType });
    }
  };

  const dismiss = async () => {
    if (!entry) return;
    setDismissed(await dismissRatePrompt(userId, entry));
    void cancelRateReminder({ tmdbId: entry.tmdb_id, mediaType });
  };

  const days = entry ? daysSinceWatched(entry) ?? 0 : 0;
  const img = posterUrl(entry?.poster_path, 'w92');

  return (
    <View style={styles.card} accessibilityLiveRegion="polite">
      <TouchableOpacity
        onPress={() => entry && open(entry.tmdb_id, mediaType)}
        accessibilityRole="button"
        accessibilityLabel={entry?.title}
        style={styles.poster}
      >
        {img ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
      </TouchableOpacity>
      <View style={styles.text}>
        <Text style={styles.question} numberOfLines={1}>
          {justRated ? RATE_PROMPT.rated(ratingToStars(justRated)) : RATE_PROMPT.question(entry?.title ?? '')}
        </Text>
        {!justRated && <Text style={styles.when}>{watchedAgoLabel(days)}</Text>}
        {!justRated && (
          <Stars value={0} disabled={busy} label={RATE_PROMPT.question(entry?.title ?? '')} onPick={pick} starWidth={28} size={22} />
        )}
      </View>
      {!justRated && (
        <TouchableOpacity
          onPress={dismiss}
          accessibilityRole="button"
          accessibilityLabel={RATE_PROMPT.dismissLabel(entry?.title ?? '')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.dismiss}
        >
          <Text style={styles.dismissText}>{RATE_PROMPT.dismiss}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  poster: { width: 44, aspectRatio: 2 / 3, borderRadius: 6, overflow: 'hidden', backgroundColor: colors.surfaceSunken },
  text: { flex: 1, minWidth: 0 },
  question: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  when: { marginTop: 1, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  dismiss: { paddingVertical: 4, paddingHorizontal: 2 },
  dismissText: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
});
