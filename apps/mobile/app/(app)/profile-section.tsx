/**
 * A profile section on its own page: watch history, favourites or lists.
 * Mirrors web's /u/:username/{history,favourites,lists} (ProfileSectionPage in
 * apps/web/src/pages/PublicProfilePage.jsx).
 *
 * A static route with params rather than u/[username]/[section]: a nested
 * static segment under u/ would shadow a real username, and the tab layout
 * registers each hidden route by name. RLS scopes every row to the viewer;
 * pagination is profileHistoryPage / profileFavouritesPage from @plot/core.
 */
import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../contexts/ThemeContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useAppData } from '../../contexts/AppDataContext';
import { usePublicProfile } from '../../hooks/usePublicProfile';
import { favoriteWords } from '../../lib/spelling';
import { Palette, fontFamily, fontSize, spacing } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { profileHistoryPage, profileFavouritesPage } from '@plot/core/publicProfileLayout.js';
import { isSectionEnabled } from '@plot/core/profileFields.js';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { PROFILE_PRIVACY } from '@plot/core/copy/profilePrivacy.js';
import { COMMON } from '@plot/core/copy/common.js';
import {
  ShelfItem, ShelfList, PosterGrid, PosterRail, ListCovers, HistoryRows, ShelfHeading, ShelfButton,
} from '../../components/ProfileShelves';

type Section = 'history' | 'favourites' | 'lists';

interface PageResult { items: ShelfItem[]; hasMore: boolean; page: number; retry: number; error: boolean }

export default function ProfileSectionScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openPanel } = useMediaPanel();
  const params = useLocalSearchParams<{ username: string; section: string }>();
  const username = String(params.username ?? '');
  const section: Section = params.section === 'favourites' || params.section === 'lists' ? params.section : 'history';
  const { userId: viewerId, profile: viewerProfile } = useAppData();
  const { loading, profile, locked, customLists } = usePublicProfile(username, viewerId);

  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [result, setResult] = useState<PageResult>({ items: [], hasMore: false, page: -1, retry: -1, error: false });
  const profileId = profile?.id;
  const paged = section !== 'lists';
  const fetching = paged && (result.page !== page || result.retry !== retry);

  useEffect(() => {
    if (!paged || !profileId || locked) return undefined;
    let cancelled = false;
    const fetchPage = section === 'favourites' ? profileFavouritesPage : profileHistoryPage;
    fetchPage(supabase, profileId, page).then((next: { items: ShelfItem[]; hasMore: boolean }) => {
      if (!cancelled) setResult({ ...next, page, retry, error: false });
    }).catch(() => {
      if (!cancelled) setResult({ items: [], hasMore: false, page, retry, error: true });
    });
    return () => { cancelled = true; };
  }, [paged, section, profileId, locked, page, retry]);

  const openMedia = (it: ShelfItem) => {
    if (it.tmdb_id) openPanel(it.tmdb_id, it.media_type === 'tv' ? 'tv' : 'movie');
  };

  const name = profile ? (profile.display_name || profile.username) : '';
  const fw = favoriteWords(viewerProfile?.region);
  const title = section === 'favourites' ? fw.plural : section === 'lists' ? PUBLIC_PROFILE_PAGE.lists : PUBLIC_PROFILE_PAGE.watchHistory;
  const lists = (customLists || []).filter((l) => l.items?.length) as ShelfList[];
  const expanded = lists.find((l) => l.id === expandedList);
  const busy = loading || (!!profile && !locked && fetching);
  // Section toggles are layout, not access (RLS already scoped the rows), but
  // "View all" on a shelf the owner hid shouldn't bring it back either.
  const hidden = paged && !isSectionEnabled(profile?.profile_sections, section === 'favourites' ? 'favourites' : 'recent');
  const empty = hidden || (section === 'lists' ? lists.length === 0 : result.items.length === 0);

  let body: React.ReactNode;
  if (busy) body = <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xl }} />;
  else if (locked) body = <Text style={styles.sparse}>{PROFILE_PRIVACY.lockedSubPage}</Text>;
  else if (!profile || empty) body = <Text style={styles.sparse}>{PUBLIC_PROFILE_PAGE.noPublicTitles}</Text>;
  else if (result.error && paged) body = (
    <View style={styles.row}>
      <Text style={styles.sparse}>{COMMON.genericError}</Text>
      <ShelfButton label={PUBLIC_PROFILE_PAGE.retry} onPress={() => setRetry((v) => v + 1)} />
    </View>
  );
  else if (section === 'lists') body = (
    <>
      <ListCovers lists={lists} countLabel={PUBLIC_PROFILE_PAGE.titleCount} expandedId={expandedList}
        onToggle={(id) => setExpandedList((v) => (v === id ? null : id))} />
      {expanded && (
        <View style={{ marginTop: spacing.lg }}>
          <ShelfHeading title={expanded.name} right={<ShelfButton label={PUBLIC_PROFILE_PAGE.showLess} onPress={() => setExpandedList(null)} />} />
          <PosterRail items={expanded.items} onOpen={openMedia} />
        </View>
      )}
    </>
  );
  else body = (
    <>
      {section === 'favourites'
        ? <PosterGrid items={result.items} columns={4} onOpen={openMedia} />
        : <HistoryRows items={result.items} onOpen={openMedia} />}
      <View style={[styles.row, { marginTop: spacing.lg }]}>
        {page > 0 && <ShelfButton label={COMMON.back} onPress={() => setPage((v) => v - 1)} />}
        {result.hasMore && <ShelfButton label={COMMON.next} onPress={() => setPage((v) => v + 1)} />}
      </View>
    </>
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Go back" accessibilityRole="button" style={styles.back}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
          <Text style={styles.backText} numberOfLines={1}>{name || `@${username}`}</Text>
        </TouchableOpacity>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }]}>
        <Text style={styles.title}>{title}</Text>
        {body}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: 4, flexShrink: 1 },
  backText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, flexShrink: 1 },
  body: { paddingHorizontal: spacing.xl },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary, marginBottom: spacing.lg },
  sparse: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
