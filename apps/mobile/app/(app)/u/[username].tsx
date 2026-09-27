import { buildProfileShareUrl } from '@plot/core/sharing.js';
import { SHARING } from '@plot/core/copy/sharing.js';
import { shareLink } from '../../../lib/share';
import { EVENTS } from '../../../lib/analytics';
/**
 * Public profile — /u/:username (mirrors web PublicProfilePage on a phone).
 * Compact identity, a locked state for private profiles the viewer doesn't
 * follow, then Top 5, lists, favourites, watch history, Watching and Want to
 * watch. Selection comes from publicProfileLayout in @plot/core; the shelves
 * themselves are components/ProfileShelves.tsx. "View all" opens
 * app/(app)/profile-section.tsx.
 */
import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Modal,
} from 'react-native';
import { Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import EditProfileModal from '../../../components/EditProfileModal';
import { SOCIAL_LINKS } from '@plot/core/profileFields.js';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { supabase } from '../../../lib/supabase';
import { useTheme } from '../../../contexts/ThemeContext';
import { useMediaPanel } from '../../../contexts/MediaPanelContext';
import { useAppData } from '../../../contexts/AppDataContext';
import { usePublicProfile } from '../../../hooks/usePublicProfile';
import { favoriteWords } from '../../../lib/spelling';
import { useFollows } from '../../../hooks/useFollows';
import { useBlocks } from '@plot/core/useBlocks.js';
import UserModerationMenu from '../../../components/UserModerationMenu';
import { Avatar, ProfileBadges } from '../../../components/Avatar';
import { UserList, SocialUser } from '../../../components/UserList';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../../lib/tabBar';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { PROFILE_PRIVACY } from '@plot/core/copy/profilePrivacy.js';
import { publicProfileLayout } from '@plot/core/publicProfileLayout.js';
import { MEDIA } from '@plot/core/copy/media.js';
import {
  ShelfItem, ShelfList, PosterGrid, TopFiveGrid, PosterRail, ListCovers, HistoryRows, ShelfHeading, ShelfButton, ShelfSwitch,
} from '../../../components/ProfileShelves';

/**
 * `usernameOverride` lets the profile tab reuse this screen for the signed-in
 * user without going through the dynamic route. That matters for layout, not
 * just convenience: a Tabs.Screen pointed at the nested `u/[username]` route
 * renders its icon ~16pt above the other tabs, which the static `profile`
 * route does not.
 */
export default function ProfileScreen({ usernameOverride }: { usernameOverride?: string } = {}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { open: openPanel } = useMediaPanel();
  const [editing, setEditing] = useState(false);
  const params = useLocalSearchParams<{ username: string }>();
  const username = usernameOverride ?? params.username ?? '';
  const { userId: viewerId, profile: viewerProfile } = useAppData();

  const {
    loading, profile, locked, watchCount, recent, topMovies, topTv, favourites, watching, wantToWatch, customLists,
    refresh: refreshProfile,
  } = usePublicProfile(username, viewerId);
  const { followers, following, status, follow, unfollow, busy, canFollow, refresh } =
    useFollows(profile?.id, viewerId, profile?.follow_status ?? null);
  const blocks = useBlocks(viewerId);

  const [followList, setFollowList] = useState<'followers' | 'following' | null>(null);
  const [expandedList, setExpandedList] = useState<string | null>(null);
  // Default to whichever list has picks, so a TV-only profile doesn't open on an
  // empty shelf. The viewer's choice is kept per profile, so it resets on navigation.
  const [pickChoice, setPickChoice] = useState<{ id: string; type: 'movie' | 'tv' } | null>(null);
  const pickType: 'movie' | 'tv' = pickChoice && pickChoice.id === profile?.id
    ? pickChoice.type
    : (!topMovies.length && topTv.length ? 'tv' : 'movie');
  const setPickType = (type: 'movie' | 'tv') => { if (profile?.id) setPickChoice({ id: profile.id, type }); };

  const isOwn = !!viewerId && !!profile?.id && viewerId === profile.id;
  // Viewer's own region, not the profile owner's (AGENTS.md: region-aware spelling).
  const fw = favoriteWords(viewerProfile?.region);
  const found = !loading && !!profile;
  const isPrivate = !!profile && !profile.is_public;
  const name = profile ? (profile.display_name || profile.username) : '';

  const openMedia = (it: ShelfItem) => {
    if (it.tmdb_id) openPanel(it.tmdb_id, it.media_type === 'tv' ? 'tv' : 'movie');
  };
  const openSection = (section: 'history' | 'favourites' | 'lists') =>
    router.push({ pathname: '/(app)/profile-section', params: { username: profile?.username ?? username, section } } as any);

  // What shows, and in what order, is shared with web: honours the owner's
  // section toggles, the Top 5 cap, the list cap and never shows an empty shelf.
  const content = publicProfileLayout({
    locked, sections: profile?.profile_sections, recent, topMovies, topTv, favourites, watching, wantToWatch, customLists,
  });
  const hasPicks = content.topMovies.length > 0 || content.topTv.length > 0;
  const picks = pickType === 'tv' ? content.topTv : content.topMovies;
  const lists = content.customLists as ShelfList[];
  const expanded = lists.find((l) => l.id === expandedList);

  const share = () => { void shareLink({
    url: buildProfileShareUrl({ username: profile?.username }),
    title: `${name} on PLOT`,
    text: SHARING.profileText(name),
    event: EVENTS.PROFILE_SHARED,
    eventProps: { profile_id: profile?.id },
  }); };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Back bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
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
            {/* Compact identity, like web's ProfileIntro on a phone. */}
            <View style={styles.header}>
              <Avatar url={profile!.avatar_url} name={name} size={64} colors={colors} />
              <View style={styles.headerText}>
                <View style={styles.nameLine}>
                  <Text style={styles.name} numberOfLines={2}>{name}</Text>
                  <ProfileBadges
                    isPremium={profile!.is_premium}
                    isSupporter={profile!.is_supporter}
                    size={18}
                    colors={colors}
                  />
                </View>
                <Text style={styles.handle}>@{profile!.username}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              {isOwn ? (
                <TouchableOpacity style={styles.btnSecondary} onPress={() => setEditing(true)} accessibilityRole="button">
                  <Text style={styles.btnSecondaryText}>{PUBLIC_PROFILE_PAGE.editProfile}</Text>
                </TouchableOpacity>
              ) : canFollow && (
                status === 'accepted' ? (
                  <TouchableOpacity style={styles.btnSecondary} onPress={unfollow} disabled={busy} accessibilityRole="button">
                    <Text style={styles.btnSecondaryText}>Following</Text>
                  </TouchableOpacity>
                ) : status === 'pending' ? (
                  <TouchableOpacity style={styles.btnSecondary} onPress={unfollow} disabled={busy} accessibilityRole="button">
                    <Text style={styles.btnSecondaryText}>Requested</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.btnPrimary} onPress={follow} disabled={busy} accessibilityRole="button">
                    <Text style={styles.btnPrimaryText}>{isPrivate ? PUBLIC_PROFILE_PAGE.requestToFollow : PUBLIC_PROFILE_PAGE.follow}</Text>
                  </TouchableOpacity>
                )
              )}
              <TouchableOpacity style={styles.btnSecondary} accessibilityRole="button" onPress={share}>
                <Text style={styles.btnSecondaryText}>{PUBLIC_PROFILE_PAGE.shareProfile}</Text>
              </TouchableOpacity>
              {/* Report / block. Guideline 1.2 wants both wherever another
                  account's content is rendered. Renders nothing for your own
                  profile or when signed out. */}
              {!isOwn && !!viewerId && !!profile?.id && (
                <UserModerationMenu
                  targetId={profile.id}
                  targetName={profile.display_name || profile.username}
                  surface="profile"
                  viewerId={viewerId}
                  blocks={blocks}
                  // Both, and the profile one is not optional: blocking makes
                  // get_profile_card stop returning this row, so without it the
                  // person you just blocked stays on screen until you navigate
                  // away. refresh() only reloads follows.
                  onChanged={() => { void refresh(); void refreshProfile(); }}
                />
              )}
            </View>

            {!!profile!.bio && <Text style={styles.bio}>{profile!.bio}</Text>}

            {/* Nonzero counts only, inline, as on web. */}
            {((!locked && watchCount > 0) || followers > 0 || following > 0) && (
              <View style={styles.stats}>
                {!locked && watchCount > 0 && <Stat num={watchCount} label="watched" styles={styles} />}
                {followers > 0 && <TouchableOpacity onPress={() => setFollowList('followers')} accessibilityRole="button"><Stat num={followers} label="followers" styles={styles} /></TouchableOpacity>}
                {following > 0 && <TouchableOpacity onPress={() => setFollowList('following')} accessibilityRole="button"><Stat num={following} label="following" styles={styles} /></TouchableOpacity>}
              </View>
            )}

            {/* Fixed set of external links, rendered from the shared definition
                so a link added on web can't go missing here. */}
            {!!profile!.links && Object.keys(profile!.links).length > 0 && (
              <View style={styles.linksRow}>
                {SOCIAL_LINKS.filter((l: { key: string }) => profile!.links?.[l.key]).map((l: { key: string; label: string; url: (v: string) => string }) => (
                  <TouchableOpacity
                    key={l.key}
                    onPress={() => Linking.openURL(l.url(profile!.links![l.key]))}
                    accessibilityRole="link"
                    accessibilityLabel={l.label}
                  >
                    <Text style={styles.linkChip}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {locked && (
              <View style={styles.lockCard}>
                <Text style={styles.lockKicker}>{PROFILE_PRIVACY.lockedTitle.toUpperCase()}</Text>
                <Text style={styles.lockCopy}>
                  {status === 'pending'
                    ? PROFILE_PRIVACY.lockedPending
                    : PROFILE_PRIVACY.lockedFollow(name)}
                </Text>
              </View>
            )}

            {hasPicks && (
              <View style={styles.section}>
                <ShelfHeading
                  title={PUBLIC_PROFILE_PAGE.topFive}
                  // Always both, so a visitor can see the other list exists even when it is empty.
                  right={<ShelfSwitch label={PUBLIC_PROFILE_PAGE.topFive} value={pickType} onChange={setPickType}
                    options={[{ value: 'movie', label: MEDIA.movies }, { value: 'tv', label: MEDIA.tv }]} />}
                />
                {picks.length > 0 ? (
                  <>
                    <TopFiveGrid items={picks} onOpen={openMedia} />
                    <Text style={styles.hint}>{PUBLIC_PROFILE_PAGE.tapPosterForDetails}</Text>
                  </>
                ) : (
                  <Text style={styles.sparse}>{PUBLIC_PROFILE_PAGE.noPicksOfType(pickType === 'tv' ? MEDIA.tv : MEDIA.movies)}</Text>
                )}
              </View>
            )}

            {lists.length > 0 && (
              <View style={styles.section}>
                <ShelfHeading title={PUBLIC_PROFILE_PAGE.lists} right={<ShelfButton label={PUBLIC_PROFILE_PAGE.viewAll} onPress={() => openSection('lists')} />} />
                <ListCovers lists={lists} countLabel={PUBLIC_PROFILE_PAGE.titleCount} expandedId={expandedList}
                  onToggle={(id) => setExpandedList((v) => (v === id ? null : id))} />
                {expanded && (
                  <View style={styles.expanded}>
                    <ShelfHeading title={expanded.name} right={<ShelfButton label={PUBLIC_PROFILE_PAGE.showLess} onPress={() => setExpandedList(null)} />} />
                    <PosterRail items={expanded.items} onOpen={openMedia} />
                  </View>
                )}
              </View>
            )}

            {content.favourites.length > 0 && (
              <View style={styles.section}>
                <ShelfHeading title={fw.plural} right={<ShelfButton label={PUBLIC_PROFILE_PAGE.viewAll} onPress={() => openSection('favourites')} />} />
                <PosterGrid items={content.favourites.slice(0, 10)} columns={5} onOpen={openMedia} />
              </View>
            )}

            {content.recent.length > 0 && (
              <View style={styles.section}>
                <ShelfHeading title={PUBLIC_PROFILE_PAGE.watchHistory} right={<ShelfButton label={PUBLIC_PROFILE_PAGE.viewAll} onPress={() => openSection('history')} />} />
                <HistoryRows items={content.recent.slice(0, 4)} onOpen={openMedia} />
              </View>
            )}

            {([[PUBLIC_PROFILE_PAGE.watching, content.watching], [PUBLIC_PROFILE_PAGE.wantToWatch, content.wantToWatch]] as [string, ShelfItem[]][])
              .map(([label, items]) => items.length > 0 && (
                <View style={styles.section} key={label}>
                  <ShelfHeading title={label} />
                  <PosterRail items={items} onOpen={openMedia} />
                </View>
              ))}

            {!locked && content.empty && (
              <View style={styles.sparseWrap}>
                <Text style={styles.sparse}>{PUBLIC_PROFILE_PAGE.noPublicTitles}</Text>
                {isOwn && <ShelfButton label={PUBLIC_PROFILE_PAGE.addFirstPick} onPress={() => router.push('/(app)/my-lists' as any)} />}
              </View>
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

      {editing && isOwn && profile && (
        <EditProfileModal
          userId={viewerId!}
          current={profile}
          onClose={() => setEditing(false)}
          onSaved={(patch) => {
            setEditing(false);
            // A username change moves the canonical route, so re-enter it —
            // otherwise a refresh or a back-navigation lands on the old handle
            // and 404s.
            if (patch.username && patch.username !== profile.username) {
              router.replace(`/(app)/u/${patch.username}` as any);
            }
          }}
        />
      )}
    </View>
  );
}

function Stat({ num, label, styles }: { num: number; label: string; styles: ReturnType<typeof makeStyles> }) {
  return (
    <Text style={styles.stat}>
      <Text style={styles.statNum}>{num}</Text> {label}
    </Text>
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
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Close" accessibilityRole="button">
            <Text style={styles.sheetClose}>×</Text>
          </TouchableOpacity>
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          {users === null
            ? <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xl }} />
            : <UserList users={users} viewerId={viewerId} onNavigate={onClose} empty={kind === 'followers' ? PUBLIC_PROFILE_PAGE.noFollowersYet : PUBLIC_PROFILE_PAGE.notFollowingAnyoneYet} />}
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
  emptyTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary, textAlign: 'center' },
  emptyBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm },
  headerText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { fontFamily: fontFamily.display, fontSize: fontSize.xxl, color: colors.textPrimary, flexShrink: 1 },
  handle: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  btnPrimary: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.pill, backgroundColor: colors.textPrimary },
  btnPrimaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.bg },
  btnSecondary: { minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.lg, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.textPrimary },
  btnSecondaryText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary },
  bio: {
    fontFamily: fontFamily.sans, fontSize: fontSize.sm, lineHeight: 21,
    color: colors.textSecondary, marginTop: spacing.md,
  },
  linksRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
    marginTop: spacing.md,
  },
  linkChip: {
    fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: 4,
  },
  stats: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.md, flexWrap: 'wrap' },
  stat: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },
  statNum: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: colors.textPrimary },
  section: { marginTop: spacing.xxl },
  expanded: { marginTop: spacing.lg },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted, marginTop: spacing.md },
  sparse: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  sparseWrap: { marginTop: spacing.xxl, alignItems: 'flex-start', gap: spacing.md },
  lockCard: { marginTop: spacing.xl, padding: spacing.lg, borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  lockKicker: { fontFamily: fontFamily.sansBold, fontSize: 11, letterSpacing: 1, color: colors.accent },
  lockCopy: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 21, marginTop: spacing.sm },
  sheetOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.md, borderTopRightRadius: radii.md, maxHeight: '75%', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sheetTitle: { fontFamily: fontFamily.display, fontSize: fontSize.xl, color: colors.textPrimary },
  sheetClose: { fontFamily: fontFamily.sans, fontSize: 28, color: colors.textMuted, lineHeight: 30 },
});
