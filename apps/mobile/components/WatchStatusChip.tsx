/**
 * The status chip on a list title: Watching, Watched or Didn't finish. The RN
 * counterpart of web's WatchStatusChip in ListCards.jsx. Which status a title
 * has comes from @plot/core/listWatchStatus.js, shared with web.
 */
import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MEDIA } from '@plot/core/copy/media.js';
import type { ListWatchStatus } from '@plot/core/listWatchStatus.js';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, radii } from '../lib/tokens';

export default function WatchStatusChip({ status }: { status: ListWatchStatus | null | undefined }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  if (!status) return null;
  return (
    <View style={[styles.chip, styles[status]]}>
      <Text style={[styles.text, status === 'watched' && styles.textWatched, status === 'watching' && styles.textWatching]}>
        {MEDIA.watchStatus[status]}
      </Text>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  chip: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill },
  watched: { backgroundColor: colors.accentSecondaryFill },
  watching: { backgroundColor: colors.accentFill },
  dnf: { backgroundColor: colors.chipTomorrow + '47' },
  text: { fontFamily: fontFamily.sansMedium, fontSize: 11, lineHeight: 16, color: colors.textPrimary },
  textWatched: { color: colors.onAccentSecondaryFill },
  textWatching: { color: colors.onAccentFill },
});
