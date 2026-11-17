import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { movieGuide, tvGuide } from '@plot/core/parentalGuide.js';
import { getTmdbRegion, tmdb } from '../lib/tmdb';
import { fontFamily, type Palette } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';

export type ParentalGuideDetails = {
  release_dates?: Parameters<typeof movieGuide>[0];
};

/**
 * The title's facts line, with the regional rating on it: "2024 · 3 seasons ·
 * MA 15+". The line renders with or without a rating. The rating is a label
 * and nothing else: no meaning, no advisories, and no control to hide or
 * show it.
 */
export default function ParentalGuide({
  mediaType,
  tmdbId,
  details,
  facts,
  factsStyle,
}: {
  mediaType: 'movie' | 'tv';
  tmdbId: number;
  details: ParentalGuideDetails | null;
  facts: Array<string | null | undefined>;
  /** The panel's own facts text style, so the line matches the head it sits in. */
  factsStyle: StyleProp<TextStyle>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const region = getTmdbRegion();
  const [ratings, setRatings] = useState<Parameters<typeof tvGuide>[0]>(null);

  useEffect(() => {
    if (mediaType !== 'tv') return undefined;
    let cancelled = false;
    tmdb.contentRatings(tmdbId).then(data => { if (!cancelled) setRatings(data); });
    return () => { cancelled = true; };
  }, [mediaType, tmdbId]);

  const guide = mediaType === 'tv'
    ? tvGuide(ratings, region)
    : movieGuide(details?.release_dates, region);

  const lead = facts.filter(Boolean).join(' · ');
  if (!lead && !guide) return null;
  return (
    <Text style={factsStyle}>
      {lead}
      {lead && guide ? ' · ' : ''}
      {guide ? <Text style={styles.rating}>{guide.certification}</Text> : null}
    </Text>
  );
}

function makeStyles(colors: Palette) {
  return StyleSheet.create({
    // Nested in the facts line, so size and line height come from it.
    rating: { fontFamily: fontFamily.sansBold, color: colors.textPrimary },
  });
}
