import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { loadCertificationMeaning, movieGuide, tvGuide } from '@plot/core/parentalGuide.js';
import { regionName } from '@plot/core/regions.js';
import { getTmdbRegion, tmdb } from '../lib/tmdb';
import { fontFamily, fontSize, type Palette } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

type Details = { release_dates?: Parameters<typeof movieGuide>[0] };

/**
 * Regional rating under the title facts. Advisories open on the rating.
 * Signed-in members can hide it from here. Settings screens are in other pulls.
 */
export default function ParentalGuide({
  mediaType,
  tmdbId,
  details,
  signedIn,
  hidden,
  onSetShown,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  details: Details | null;
  signedIn: boolean;
  hidden: boolean;
  onSetShown: (shown: boolean) => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const region = getTmdbRegion();
  const [ratings, setRatings] = useState<Parameters<typeof tvGuide>[0]>(null);
  const [meaning, setMeaning] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [seenHidden, setSeenHidden] = useState(hidden);
  const [shown, setShown] = useState(!hidden);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  if (seenHidden !== hidden) {
    setSeenHidden(hidden);
    setShown(!hidden);
  }

  useEffect(() => {
    if (mediaType !== 'tv') return undefined;
    let cancelled = false;
    tmdb.contentRatings(tmdbId).then(data => { if (!cancelled) setRatings(data); });
    return () => { cancelled = true; };
  }, [mediaType, tmdbId]);

  const guide = mediaType === 'tv'
    ? tvGuide(ratings, region)
    : movieGuide(details?.release_dates, region);
  const certification = guide?.certification ?? null;

  useEffect(() => {
    if (!certification) return undefined;
    let cancelled = false;
    loadCertificationMeaning(tmdb, mediaType, region, certification).then(text => {
      if (!cancelled) setMeaning(text);
    });
    return () => { cancelled = true; };
  }, [mediaType, region, certification]);

  async function setPreference(next: boolean) {
    if (!signedIn || saving) return;
    setSaving(true);
    setError(false);
    setShown(next);
    const ok = await onSetShown(next);
    if (!ok) {
      setShown(!next);
      setError(true);
    }
    setSaving(false);
  }

  if (!shown) {
    if (!signedIn) return null;
    return (
      <View style={styles.wrap}>
        <TouchableOpacity
          style={styles.action}
          onPress={() => setPreference(true)}
          accessibilityRole="button"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.actionText}>{MEDIA_PANEL.showParentalGuide}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{MEDIA_PANEL.couldNotUpdateParentalGuide}</Text> : null}
      </View>
    );
  }

  if (!guide) return null;
  const descriptors = guide.descriptors.join(', ');

  return (
    <View style={styles.wrap}>
      <View style={styles.ratingRow}>
        <TouchableOpacity
          onPress={() => setOpen(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${guide.certification}. ${MEDIA_PANEL.parentalGuide}`}
        >
          <Text style={styles.rating}>{guide.certification}</Text>
        </TouchableOpacity>
        {open && signedIn ? (
          <TouchableOpacity
            style={styles.action}
            onPress={() => setPreference(false)}
            accessibilityRole="button"
            accessibilityLabel={`${MEDIA_PANEL.hideParentalGuide} ${MEDIA_PANEL.parentalGuide}`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.actionText}>{MEDIA_PANEL.hideParentalGuide}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {open ? (
        <View style={styles.body}>
          <Text style={styles.region}>{regionName(region)}</Text>
          {meaning ? <Text style={styles.copy}>{meaning}</Text> : null}
          {descriptors ? <Text style={styles.copy}>{descriptors}</Text> : null}
        </View>
      ) : null}
      {error ? <Text style={styles.error}>{MEDIA_PANEL.couldNotUpdateParentalGuide}</Text> : null}
    </View>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: { marginTop: 6, alignItems: 'flex-start' },
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    rating: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
    body: { marginTop: 4, gap: 4, alignItems: 'flex-start' },
    region: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textMuted },
    copy: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary },
    action: {
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 999,
      backgroundColor: colors.surfaceSunken,
    },
    actionText: {
      fontFamily: fontFamily.sansBold,
      fontSize: fontSize.xs,
      color: colors.textMuted,
    },
    error: { marginTop: 4, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  });
}
