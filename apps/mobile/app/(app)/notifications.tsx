/**
 * Notifications — /(app)/notifications (mirrors web NotificationsView).
 * Accepted follow requests, new requests, new followers, post activity, and
 * new episodes of followed shows (title rows: a poster instead of an avatar,
 * and they open the title rather than a profile).
 */
import { useEffect, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useNotifications } from '@plot/core/useNotifications.js';
import { notificationPhrase, alertPhrase, alertBadge, ALERT_NOTIFICATIONS, NOTIFICATIONS_EMPTY, titleBadge, titleFallback, titlePhrase, SMART_LIST_DIGEST } from '@plot/core/copy/notifications.js';
import { isAlertNotification, isTitleNotification, smartListDigest } from '@plot/core/notificationGroups.js';
import { relativeTime } from '@plot/core/date.js';
import { Avatar } from '../../components/Avatar';
import { posterUrl, profileUrl, Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { PEOPLE } from '@plot/core/copy/people.js';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

interface NotificationRow {
  id: string;
  type: string;
  created_at: string;
  read_at: string | null;
  actor_username?: string;
  actor_display_name?: string;
  actor_avatar_url?: string | null;
  post_title?: string;
  // Title rows (Premium alerts, new_episode and movie_release): no actor, a title instead.
  tmdb_id?: number | null;
  media_type?: string | null;
  media_title?: string | null;
  media_poster_path?: string | null;
  season_number?: number | null;
  episode_number?: number | null;
  episode_count?: number | null;
  person_name?: string | null;
  person_profile_path?: string | null;
  person_role?: string | null;
  release_kind?: string | null;
  provider_name?: string | null;
  // The weekly smart lists roll-up (smart_list_digest): no actor, no title.
  smart_list_digest?: unknown;
}

const POST_TYPES = new Set(['post_like', 'post_comment', 'comment_like']);

export default function NotificationsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId, profile } = useAppData();
  const { list, loading, refreshList, markAllRead } = useNotifications(userId);
  const { open: openPanel } = useMediaPanel();

  // Load the feed and clear the unread badge on open — same as web.
  useEffect(() => { refreshList(); }, [refreshList]);
  useEffect(() => { markAllRead(); }, [markAllRead]);

  const go = (n: NotificationRow) => {
    if ((isTitleNotification(n) || isAlertNotification(n)) && n.tmdb_id != null) openPanel(n.tmdb_id, n.media_type === 'movie' ? 'movie' : 'tv');
    else if (n.type === 'follow_request') router.push('/(app)/requests');
    // No feed surface on mobile yet (SHOW_SOCIAL_FEED is off on both
    // platforms), so post activity opens the actor instead of a dead route.
    else if (n.actor_username) router.push(`/(app)/u/${n.actor_username}`);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Notifications</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xxl }} />
        ) : list.length === 0 ? (
          <Text style={styles.empty}>{NOTIFICATIONS_EMPTY.title}{'\n'}{NOTIFICATIONS_EMPTY.body}</Text>
        ) : (
          <>
          {list.map((n: NotificationRow) => {
            // The weekly smart lists roll-up stays read-only. Smart lists
            // themselves are still web-only until issue 1094. The wording is
            // shared with web via core.
            const digest = smartListDigest(n);
            if (digest) {
              const title = SMART_LIST_DIGEST.title(digest.count);
              return (
                <View key={n.id} style={[styles.row, !n.read_at && styles.rowUnread]} accessibilityLabel={title}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowText}><Text style={styles.rowName}>{title}</Text></Text>
                    {digest.lists.length > 0 && <Text style={styles.rowMuted}>{SMART_LIST_DIGEST.lists(digest.lists)}</Text>}
                    <Text style={styles.rowTime}>{relativeTime(n.created_at)}</Text>
                  </View>
                </View>
              );
            }
            if (isAlertNotification(n)) {
              const title = n.media_title || ALERT_NOTIFICATIONS.untitled;
              const phrase = alertPhrase(n) ?? '';
              const poster = posterUrl(n.media_poster_path, 'w92');
              const face = profileUrl(n.person_profile_path, 'w92');
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.row, !n.read_at && styles.rowUnread]}
                  onPress={() => go(n)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${title}${phrase}`}
                >
                  <View style={styles.posterWrap}>
                    {poster
                      ? <Image source={{ uri: poster }} style={styles.poster} />
                      : <View style={styles.poster} />}
                    {face ? <Image source={{ uri: face }} style={styles.posterFace} /> : null}
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowBadge}>{alertBadge(n)}</Text>
                    <Text style={styles.rowText}>
                      <Text style={styles.rowName}>{title}</Text>{phrase}
                    </Text>
                    <Text style={styles.rowTime}>{relativeTime(n.created_at, undefined, profile?.region)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }
            if (isTitleNotification(n)) {
              const title = n.media_title || titleFallback(n);
              const phrase = titlePhrase(n);
              const poster = posterUrl(n.media_poster_path, 'w92');
              return (
                <TouchableOpacity
                  key={n.id}
                  style={[styles.row, !n.read_at && styles.rowUnread]}
                  onPress={() => go(n)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`${title} ${phrase}`}
                >
                  {poster
                    ? <Image source={{ uri: poster }} style={styles.poster} />
                    : <View style={styles.poster} />}
                  <View style={styles.rowBody}>
                    <Text style={styles.rowBadge}>{titleBadge(n)}</Text>
                    <Text style={styles.rowText}>
                      <Text style={styles.rowName}>{title}</Text>
                      {' '}{phrase}
                    </Text>
                    <Text style={styles.rowTime}>{relativeTime(n.created_at, undefined, profile?.region)}</Text>
                  </View>
                </TouchableOpacity>
              );
            }
            const name = n.actor_display_name || n.actor_username || '';
            return (
              <TouchableOpacity
                key={n.id}
                style={[styles.row, !n.read_at && styles.rowUnread]}
                onPress={() => go(n)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${name} ${notificationPhrase(n.type)}`}
              >
                <Avatar url={n.actor_avatar_url} name={name} size={44} colors={colors} />
                <View style={styles.rowBody}>
                  <Text style={styles.rowText}>
                    <Text style={styles.rowName}>{name}</Text>
                    {' '}{notificationPhrase(n.type)}
                    {POST_TYPES.has(n.type) && n.post_title
                      ? <Text style={styles.rowMuted}> · {n.post_title}</Text>
                      : null}
                    {n.type === 'follow_request'
                      ? <Text style={styles.rowReview}> · review</Text>
                      : null}
                  </Text>
                  <Text style={styles.rowTime}>{relativeTime(n.created_at, undefined, profile?.region)}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
          {list.some((n: NotificationRow) => n.type === 'person_release') && (
            <TouchableOpacity
              onPress={() => router.push('/(app)/your-people' as Href)}
              accessibilityRole="button"
              style={styles.peopleFooter}
            >
              <Text style={styles.peopleFooterBody}>{PEOPLE.notificationsFooter.body}</Text>
              <Text style={styles.peopleFooterLink}>{PEOPLE.notificationsFooter.link}</Text>
            </TouchableOpacity>
          )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 4 },
  topBarTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  empty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22, paddingVertical: spacing.xxl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  // Unread carries a tint rather than a dot, matching web.
  rowUnread: { backgroundColor: colors.accentDim, borderRadius: radii.sm },
  rowBody: { flex: 1, minWidth: 0 },
  rowText: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary, lineHeight: 20 },
  rowName: { fontFamily: fontFamily.sansBold },
  rowMuted: { color: colors.textMuted },
  rowReview: { color: colors.accent },
  // Title rows: the poster stands where the 44pt avatar would.
  poster: { width: 44, height: 66, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken },
  posterWrap: { width: 44, height: 66, overflow: 'visible' },
  posterFace: {
    position: 'absolute', right: -7, bottom: -5, width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: colors.bg, backgroundColor: colors.surfaceSunken,
  },
  peopleFooter: {
    marginTop: spacing.lg, padding: spacing.md, borderRadius: radii.md,
    backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, gap: spacing.xs,
  },
  peopleFooterBody: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 },
  peopleFooterLink: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.accent },
  rowBadge: { fontFamily: fontFamily.sansMedium, fontSize: 12, color: colors.textSecondary, marginBottom: 2 },
  rowTime: { fontFamily: fontFamily.sans, fontSize: 12, color: colors.textMuted, marginTop: 2 },
});
