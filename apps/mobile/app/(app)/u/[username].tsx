/**
 * Public profile — /u/:username (mirrors web PublicProfilePage).
 * Header + follow button + stats, a locked state for private profiles the
 * viewer doesn't follow, and Recently-watched / Top-10 / Favourites poster
 * grids. Followers/Following open a bottom-sheet user list.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image, StyleSheet,
  ActivityIndicator, Dimensions, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../contexts/ThemeContext';
import { useMediaPanel } from '../../../contexts/MediaPanelContext';
import { useAppData } from '../../../contexts/AppDataContext';
import { usePublicProfile } from '../../../hooks/usePublicProfile';
import { useFollows } from '../../../hooks/useFollows';
import { Avatar, PremiumBadge } from '../../../components/Avatar';
import { UserList, SocialUser } from '../../../components/UserList';
import { posterUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../../lib/tabBar';

const SCREEN_W = Dimensions.get('window').width;
const GRID_GAP = spacing.sm;
const GRID_COLS = 4;
const POSTER_W = (SCREEN_W - spacing.xl * 2 - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const POSTER_H = POSTER_W * 1.5; // 2:3 poster — explicit height (aspectRatio collapses in a flex-wrap row on Fabric)

interface PosterItem {
  tmdb_id: number;
  media_type?: string;
  title?: string;
  poster_path?: string | null;
  rank?: number;
}

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openPanel } = useMediaPanel();
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  const { userId: viewerId } = useAppData();

  const { loading, profile, locked, watchCount, avgRating, recent, topMovies, topTv, favourites } =
    usePublicProfile(username, viewerId);
  const { followers, following, status, follow, unfollow, busy, canFollow } =
    useFollows(profile?.id, viewerId, profile?.follow_status ?? null);

  const [followList, setFollowList] = useState<'followers' | 'following' | null>(null);

  const isOwn = !!viewerId && !!profile?.id && viewerId === profile.id;
  const found = !loading && !!profile;
  const isPrivate = !!profile && !profile.is_public;
  const name = profile ? (profile.display_name || profile.username) : '';

  const openMedia = (it: PosterItem) => {
    if (it.tmdb_id) openPanel(it.tmdb_id, it.media_type === 'tv' ? 'tv' : 'movie');
  };

  const PosterGrid = ({ items, ranked = false }: { items: PosterItem[]; ranked?: boolean }) => {
    if (!items?.length) return null;
    return (
      <View style={styles.grid}>
        {items.map((it, i) => {
          const img = posterUrl(it.poster_path, 'w185');
          return (
            <TouchableOpacity
              key={`${it.tmdb_id}-${it.rank ?? i}`}
              style={styles.poster}
              activeOpacity={0.8}
              onPress={() => openMedia(it)}
            >
              {img
                ? <Image source={{ uri: img }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                : <View style={styles.posterFallback}><Text style={styles.posterFallbackText} numberOfLines={3}>{it.title}</Text></View>}
              {ranked && it.rank != null && (
                <View style={styles.rankBadge}><Text style={styles.rankText}>{it.rank}</Text></View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const noPublicContent = !locked && watchCount === 0 && recent.length === 0
    && topMovies.length === 0 && topTv.length === 0 && favourites.length === 0;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Back bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn}>
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        {found && isOwn && (
          <>
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => router.push('/(app)/settings' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={{ paddingRight: spacing.md }}>
              <Text style={styles.editTop}>Edit</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}>
        {!found ? (
          <View style={styles.emptyWrap}>
            {loading ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <>
                <Text style={styles.emptyTitle}>This profile isn't public</Text>
                <Text style={styles.emptyBody}>@{String(username).replace(/^@/, '')} either doesn't exist or hasn't made their profile public yet.</Text>
              </>
            )}
          </View>
        ) : (
          <View style={styles.body}>
            {/* Header */}
            <View style={styles.header}>
              <Avatar url={profile!.avatar_url} name={name} size={80} colors={colors} />
              <View style={styles.headerText}>
                <View style={styles.nameLine}>
                  <Text style={styles.name} numberOfLines={2}>{name}</Text>
                  {profile!.is_premium && <PremiumBadge size={18} />}
                </View>
                <Text style={styles.handle}>@{profile!.username}</Text>
              </View>
            </View>

            {/* Actions (follow) — own-profile edit lives in the top bar */}
            {!isOwn && canFollow && (
              <View style={styles.actions}>
                {status === 'accepted' ? (
                  <TouchableOpacity style={styles.btnSecondary} onPress={unfollow} disabled={busy}>
                    <Text style={styles.btnSecondaryText}>Following</Text>
                  </TouchableOpacity>
                ) : status === 'pending' ? (
                  <TouchableOpacity style={styles.btnSecondary} onPress={unfollow} disabled={busy}>
                    <Text style={styles.btnSecondaryText}>Requested</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.btnPrimary} onPress={follow} disabled={busy}>
                    <Text style={styles.btnPrimaryText}>{isPrivate ? 'Request to follow' : 'Follow'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Stats */}
            <View style={styles.stats}>
              {!locked && <Stat num={String(watchCount)} label="Watched" colors={colors} />}
              {!locked && avgRating != null && <Stat num={String(avgRating)} label="Avg rating" colors={colors} />}
              <TouchableOpacity onPress={() => setFollowList('followers')}><Stat num={String(followers)} label="Followers" colors={colors} /></TouchableOpacity>
              <TouchableOpacity onPress={() => setFollowList('following')}><Stat num={String(following)} label="Following" colors={colors} /></TouchableOpacity>
            </View>

            {/* Private lock */}
            {locked && (
              <View style={styles.lockCard}>
                <Text style={styles.lockKicker}>PRIVATE ACCOUNT</Text>
                <Text style={styles.lockCopy}>
                  {status === 'pending'
                    ? 'Your follow request is pending. You’ll see their watches and lists once they approve it.'
                    : `Follow ${name} to see their watch count, recent watches and lists.`}
                </Text>
              </View>
            )}

            {!locked && recent.length > 0 && (
              <Section title="Recently watched" colors={colors}><PosterGrid items={recent} /></Section>
            )}
            {topMovies.length > 0 && (
              <Section title="Top 10 films" colors={colors}><PosterGrid items={topMovies} ranked /></Section>
            )}
            {topTv.length > 0 && (
              <Section title="Top 10 TV" colors={colors}><PosterGrid items={topTv} ranked /></Section>
            )}
            {favourites.length > 0 && (
              <Section title="Favorites" colors={colors}><PosterGrid items={favourites} /></Section>
            )}

            {noPublicContent && (
              <Text style={styles.noContent}>{name} hasn't logged anything public yet.</Text>
            )}
          </View>
        )}
      </ScrollView>

      {/* Followers / Following sheet */}
      <Modal visible={!!followList && !!profile} transparent animationType="slide" onRequestClose={() => setFollowList(null)}>
        {followList && profile && (
          <FollowListModal
            kind={followList}
            targetId={profile.id}
            viewerId={viewerId}
            onClose={() => setFollowList(null)}
          />
        )}
      </Modal>
    </View>
  );
}

function Stat({ num, label, colors }: { num: string; label: string; colors: Palette }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, lineHeight: fontSize.xxl + 2 }}>{num}</Text>
      <Text style={{ fontFamily: fontFamily.sans, fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: colors.textMuted, marginTop: 3 }}>{label}</Text>
    </View>
  );
}

function Section({ title, colors, children }: { title: string; colors: Palette; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: spacing.xl }}>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.textMuted, marginBottom: spacing.md }}>{title}</Text>
      {children}
    </View>
  );
}

function FollowListModal({
  kind, targetId, viewerId, onClose,
}: { kind: 'followers' | 'following'; targetId: string; viewerId?: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [users, setUsers] = useState<SocialUser[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const rpc = kind === 'followers' ? 'list_followers' : 'list_following';
    supabase.rpc(rpc, { p_target: targetId }).then(({ data }) => { if (!cancelled) setUsers((data ?? []) as SocialUser[]); });
    return () => { cancelled = true; };
  }, [kind, targetId]);

  return (
    <View style={styles.sheetOverlay}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.xl }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{kind === 'followers' ? 'Followers' : 'Following'}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.sheetClose}>×</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {users === null
            ? <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xl }} />
            : <UserList users={users} viewerId={viewerId} onNavigate={onClose} empty={kind === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'} />}
        </ScrollView>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 4 },
  body: { paddingHorizontal: spacing.xl },
  emptyWrap: { alignItems: 'center', paddingHorizontal: spacing.xl, paddingTop: spacing.xxl * 2, gap: spacing.md },
  emptyTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingTop: spacing.lg },
  headerText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { fontFamily: fontFamily.serif, fontSize: fontSize.xxl, color: colors.textPrimary, flexShrink: 1 },
  handle: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.lg },
  btnPrimary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xl, borderRadius: radii.pill, backgroundColor: colors.textPrimary },
  btnPrimaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.bg },
  btnSecondary: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xl, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textPrimary },
  btnSecondaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  editTop: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  stats: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xxl, marginTop: spacing.xl, flexWrap: 'wrap' },
  lockCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  lockKicker: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1, color: colors.accent },
  lockCopy: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm },
  noContent: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xl },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, alignItems: 'flex-start' },
  poster: { width: POSTER_W, height: POSTER_H, borderRadius: radii.sm, overflow: 'hidden', backgroundColor: colors.surfaceRaised, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  posterFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  posterFallbackText: { fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted, textAlign: 'center' },
  rankBadge: { position: 'absolute', top: 0, left: 0, minWidth: 22, paddingHorizontal: 5, paddingVertical: 1, backgroundColor: 'rgba(0,0,0,0.6)', borderBottomRightRadius: 8 },
  rankText: { fontFamily: fontFamily.serif, fontSize: fontSize.sm, color: '#fff', textAlign: 'center' },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md, maxHeight: '75%', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sheetTitle: { fontFamily: fontFamily.serif, fontSize: fontSize.xl, color: colors.textPrimary },
  sheetClose: { fontFamily: fontFamily.sans, fontSize: 28, color: colors.textMuted, lineHeight: 30 },
});
