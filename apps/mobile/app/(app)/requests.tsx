/**
 * Follow requests — /(app)/requests (mirrors web RequestsView).
 * Incoming requests to follow a private profile; approve or decline each.
 */
import { useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { useFollowRequests, FollowRequester } from '../../hooks/useFollowRequests';
import { Avatar } from '../../components/Avatar';
import { Palette, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';

export default function RequestsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { userId } = useAppData();
  const { requests, loading, approve, decline } = useFollowRequests(userId);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
          <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M15 18l-6-6 6-6" />
          </Svg>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Follow requests</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE }}
      >
        <Text style={styles.intro}>
          People asking to follow your private profile. Approving lets them see your watch count, recent watches and lists.
        </Text>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ paddingVertical: spacing.xxl }} />
        ) : requests.length === 0 ? (
          <Text style={styles.empty}>No pending requests.{'\n'}When someone asks to follow you, they'll show up here.</Text>
        ) : (
          requests.map((r: FollowRequester) => (
            <RequestRow key={r.follower_id} req={r} onApprove={() => approve(r.follower_id)} onDecline={() => decline(r.follower_id)} colors={colors} styles={styles} />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function RequestRow({
  req, onApprove, onDecline, colors, styles,
}: { req: FollowRequester; onApprove: () => void; onDecline: () => void; colors: Palette; styles: any }) {
  const name = req.display_name || req.username;
  return (
    <View style={styles.row}>
      <Avatar url={req.avatar_url} name={name} size={48} colors={colors} />
      <View style={styles.rowId}>
        <Text style={styles.rowName} numberOfLines={1}>{name}</Text>
        <Text style={styles.rowHandle} numberOfLines={1}>@{req.username}</Text>
      </View>
      <View style={styles.rowActions}>
        <TouchableOpacity style={styles.approveBtn} onPress={onApprove} activeOpacity={0.8}>
          <Text style={styles.approveText}>Approve</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.declineBtn} onPress={onDecline} activeOpacity={0.8}>
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 4 },
  topBarTitle: { fontFamily: fontFamily.sansMedium, fontSize: fontSize.md, color: colors.textPrimary },
  intro: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 21, marginVertical: spacing.lg },
  empty: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, textAlign: 'center', lineHeight: 22, paddingVertical: spacing.xxl },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowId: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary },
  rowHandle: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted, marginTop: 1 },
  rowActions: { flexDirection: 'row', gap: spacing.sm, flexShrink: 0 },
  approveBtn: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, backgroundColor: colors.textPrimary },
  approveText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.bg },
  declineBtn: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  declineText: { fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textSecondary },
});
