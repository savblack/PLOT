import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, type StyleProp, type TextStyle } from 'react-native';
import { MEDIA_PANEL } from '@plot/core/copy/mediaPanel.js';
import { loadCertificationMeaning, movieGuide, tvGuide } from '@plot/core/parentalGuide.js';
import { regionName } from '@plot/core/regions.js';
import { getTmdbRegion, tmdb } from '../lib/tmdb';
import { fontFamily, fontSize, radii, type Palette } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

export type ParentalGuideDetails = {
  release_dates?: Parameters<typeof movieGuide>[0];
};

/**
 * The title's facts line, with the regional rating on it: "2024 · 3 seasons ·
 * MA 15+". `facts` come before the rating and `after` (a movie's "Ends at")
 * follows it. The line renders with or without a rating. Advisories open on
 * the rating. Signed-in members can hide it from here. Settings screens are
 * in other pulls.
 */
export default function ParentalGuide({
  mediaType,
  tmdbId,
  details,
  signedIn,
  hidden,
  onSetShown,
  facts,
  after,
  factsStyle,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  details: ParentalGuideDetails | null;
  signedIn: boolean;
  hidden: boolean;
  onSetShown: (shown: boolean) => Promise<boolean>;
  facts: Array<string | null | undefined>;
  after?: string;
  /** The panel's own facts text style, so the line matches the head it sits in. */
  factsStyle: StyleProp<TextStyle>;
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

  const lead = facts.filter(Boolean).join(' · ');
  const factsLine = (rating: ReactNode) => {
    if (!lead && !rating && !after) return null;
    return (
      <Text style={factsStyle}>
        {lead}
        {lead && rating ? ' · ' : ''}
        {rating}
        {(lead || rating) && after ? ' · ' : ''}
        {after}
      </Text>
    );
  };

  if (!shown) {
    if (!signedIn) return factsLine(null);
    return (
      <>
        {factsLine(null)}
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
      </>
    );
  }

  if (!guide) return factsLine(null);
  const descriptors = guide.descriptors.join(', ');

  return (
    <>
      {factsLine(
        <Text
          style={styles.rating}
          onPress={() => setOpen(value => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={`${guide.certification}. ${MEDIA_PANEL.parentalGuide}`}
        >
          {guide.certification}
        </Text>
      )}
      {open || error ? (
        <View style={styles.wrap}>
          {open ? (
            <View style={styles.body}>
              <Text style={styles.region}>{regionName(region)}</Text>
              {meaning ? <Text style={styles.copy}>{meaning}</Text> : null}
              {descriptors ? <Text style={styles.copy}>{descriptors}</Text> : null}
              {signedIn ? (
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
          ) : null}
          {error ? <Text style={styles.error}>{MEDIA_PANEL.couldNotUpdateParentalGuide}</Text> : null}
        </View>
      ) : null}
    </>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    wrap: { marginTop: 6, alignItems: 'flex-start' },
    // Nested in the facts line, so size and line height come from it.
    rating: { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
    body: { gap: 4, alignItems: 'flex-start' },
    region: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textMuted },
    copy: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 18, color: colors.textSecondary },
    action: {
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: radii.pill,
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
