import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { Avatar, ProfileBadges } from './Avatar';

export interface SocialUser {
  id: string;
  username: string;
  display_name?: string | null;
  avatar_url?: string | null;
  is_premium?: boolean;
  is_supporter?: boolean;
  is_public?: boolean;
  follow_status?: string | null;
}

/** Follow / Request / Following / Requested button driven by the `follows` table. */
export function FollowButton({
  targetId, isPublic, status: initial = null, viewerId, onChange,
}: {
  targetId: string; isPublic?: boolean; status?: string | null;
  viewerId?: string | null; onChange?: (s: string | null) => void;
}) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<string | null>(initial);
  const [busy, setBusy] = useState(false);
  if (!viewerId || viewerId === targetId) return null;

  const act = async () => {
    if (busy) return;
    setBusy(true);
    if (status) {
      await supabase.from('follows').delete().eq('follower_id', viewerId).eq('following_id', targetId);
      setStatus(null);
      onChange?.(null);
    } else {
      const { error } = await supabase.from('follows').insert({ follower_id: viewerId, following_id: targetId });
      if (!error) {
        const { data } = await supabase.from('follows')
          .select('status').eq('follower_id', viewerId).eq('following_id', targetId).maybeSingle();
        const s = data?.status ?? null;
        setStatus(s);
        onChange?.(s);
      }
    }
    setBusy(false);
  };

  const label = status === 'accepted' ? 'Following'
    : status === 'pending' ? 'Requested'
    : isPublic ? 'Follow' : 'Request';
  const filled = !status;

  return (
    <TouchableOpacity
      onPress={act}
      disabled={busy}
      activeOpacity={0.7}
      style={[
        styles.followBtn,
        { borderColor: filled ? colors.textPrimary : colors.border, opacity: busy ? 0.6 : 1 },
      ]}
    >
      <Text style={[styles.followText, { color: filled ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function UserRow({
  user, viewerId, onNavigate,
}: { user: SocialUser; viewerId?: string | null; onNavigate?: () => void }) {
  const { colors } = useTheme();
  const styles2 = makeStyles(colors);
  const router = useRouter();
  const name = user.display_name || user.username;

  const goProfile = () => {
    onNavigate?.();
    router.push(`/(app)/u/${user.username}` as any);
  };

  return (
    <View style={styles2.row}>
      <TouchableOpacity style={styles2.rowMain} activeOpacity={0.7} onPress={goProfile}>
        <Avatar url={user.avatar_url} name={name} size={44} colors={colors} />
        <View style={styles2.rowText}>
          <View style={styles2.nameLine}>
            <Text style={styles2.name} numberOfLines={1}>{name}</Text>
            <ProfileBadges isPremium={user.is_premium} isSupporter={user.is_supporter} colors={colors} />
          </View>
          <Text style={styles2.handle} numberOfLines={1}>@{user.username}</Text>
        </View>
      </TouchableOpacity>
      <FollowButton
        targetId={user.id}
        isPublic={user.is_public}
        status={user.follow_status ?? null}
        viewerId={viewerId}
      />
    </View>
  );
}

export function UserList({
  users, viewerId, onNavigate, empty = 'No one here yet.',
}: { users: SocialUser[]; viewerId?: string | null; onNavigate?: () => void; empty?: string }) {
  const { colors } = useTheme();
  if (!users?.length) {
    return (
      <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
        <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted }}>{empty}</Text>
      </View>
    );
  }
  return (
    <View>
      {users.map(u => <UserRow key={u.id} user={u} viewerId={viewerId} onNavigate={onNavigate} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  followBtn: {
    flexShrink: 0,
    minHeight: 34,
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  followText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs },
});

const makeStyles = (colors: Palette) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minWidth: 0 },
  rowText: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'center' },
  name: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary, flexShrink: 1 },
  handle: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
});
