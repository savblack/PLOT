import { useMemo } from 'react';
import { ActivityIndicator, Dimensions, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { posterUrl, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { displayPosterPath } from '@plot/core/artwork.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { parseKeywordBrowse } from '@plot/core/browse.js';
import { useKeywordBrowse } from '@plot/core/useKeywordBrowse.js';
import { BROWSE } from '@plot/core/copy/browse.js';
import { useTheme } from '../../contexts/ThemeContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

const CARD_W = (Dimensions.get('window').width - spacing.xl * 2 - spacing.md * 2) / 3;

interface BrowseItem {
  id: number;
  title?: string;
  name?: string;
  media_type: 'movie' | 'tv';
  poster_path?: string | null;
}

/** Titles that share one TMDB keyword, reached from a keyword chip on a title. */
export default function BrowseScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open } = useMediaPanel();
  const art = useUserArtwork();
  const params = useLocalSearchParams<{ type?: string; keyword?: string; name?: string }>();
  const browse = useMemo(
    () => parseKeywordBrowse({ get: (k: string) => (params as Record<string, string | undefined>)[k] ?? null }),
    [params],
  );
  const { items, error, retry } = useKeywordBrowse(browse?.mediaType, browse?.keywordId) as {
    items: BrowseItem[] | null; error: boolean; retry: () => void;
  };
  const note = { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel={BROWSE.back}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={{ marginLeft: spacing.md, marginVertical: spacing.sm, width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
          <Path d="M15 18l-6-6 6-6" stroke={colors.textPrimary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </TouchableOpacity>
      <View style={{ paddingHorizontal: spacing.xl, marginBottom: spacing.lg }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.textMuted }}>{BROWSE.keywordEyebrow}</Text>
        <Text style={{ marginTop: spacing.xs, fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary, textTransform: 'capitalize' }}>
          {browse?.name ? BROWSE.keywordTitle(browse.name) : BROWSE.keywordEyebrow}
        </Text>
      </View>
      <View style={{ paddingHorizontal: spacing.xl }}>
        {!browse && <Text style={note}>{BROWSE.empty}</Text>}
        {browse && error && (
          <TouchableOpacity onPress={retry} accessibilityRole="button">
            <Text style={note}>{BROWSE.loadError}. {BROWSE.retry}</Text>
          </TouchableOpacity>
        )}
        {browse && !error && items === null && <ActivityIndicator color={colors.textMuted} />}
        {browse && !error && items?.length === 0 && <Text style={note}>{BROWSE.empty}</Text>}
        {!!items?.length && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
            {items.map(item => {
              const title = item.title || item.name || '';
              const uri = posterUrl(displayPosterPath(art.apply(item)), 'w185');
              return (
                <TouchableOpacity
                  key={`${item.media_type}-${item.id}`}
                  style={{ width: CARD_W }}
                  accessibilityRole="button"
                  accessibilityLabel={`View details for ${title}`}
                  onPress={() => open(item.id, item.media_type)}
                >
                  <View style={{ width: CARD_W, height: CARD_W * 1.5, borderRadius: radii.md, overflow: 'hidden', backgroundColor: colors.surfaceSunken }}>
                    {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
                  </View>
                  <Text numberOfLines={2} style={{ marginTop: spacing.xs, fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }}>{title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    </ScrollView>
  );
}
