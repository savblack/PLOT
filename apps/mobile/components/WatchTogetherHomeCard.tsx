/**
 * Dismissible Watch together card on Home. Rules live in
 * @plot/core/watchTogetherHome.js. Web: WatchTogetherHomeCard.jsx.
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { WATCH_TOGETHER } from '@plot/core/copy/watchTogether.js';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import {
  WATCH_TOGETHER_HOME_DISMISSED,
  watchTogetherHomeDismissed,
  watchTogetherHomeKey,
  watchTogetherHomeVisible,
} from '@plot/core/watchTogetherHome.js';
import { SHOW_WATCH_TOGETHER } from '../lib/launchFeatures';
import { readStorage, writeStorage } from '../lib/storage';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { Palette, fontFamily, fontSize, radii, spacing } from '../lib/tokens';

export default function WatchTogetherHomeCard() {
  const { userId, profile } = useAppData();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const [dismissed, setDismissed] = useState<{ userId: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!userId) return undefined;
    let alive = true;
    readStorage(watchTogetherHomeKey(userId)).then(raw => {
      if (alive) setDismissed({ userId, value: watchTogetherHomeDismissed(raw) });
    });
    return () => { alive = false; };
  }, [userId]);

  const known = dismissed?.userId === userId ? dismissed.value : null;
  if (!SHOW_WATCH_TOGETHER || !userId || known === null) return null;
  if (!watchTogetherHomeVisible({ signedIn: true, dismissed: known })) return null;

  const premium = isPremiumProfile(profile);
  const dismiss = () => {
    setDismissed({ userId, value: true });
    void writeStorage(watchTogetherHomeKey(userId), WATCH_TOGETHER_HOME_DISMISSED);
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.open}
        onPress={() => router.push('/(app)/together' as Href)}
        accessibilityRole="button"
        accessibilityLabel={WATCH_TOGETHER.navLabel}
      >
        <View style={styles.row}>
          <Text style={styles.title}>{WATCH_TOGETHER.navLabel}</Text>
          {!premium && <Text style={styles.pill}>{APP_SHELL.premium}</Text>}
        </View>
        <Text style={styles.body}>{WATCH_TOGETHER.start.pitchTitle}</Text>
        {!premium && <Text style={styles.note}>{WATCH_TOGETHER.hub.lockedNote}</Text>}
      </TouchableOpacity>
      <TouchableOpacity
        onPress={dismiss}
        accessibilityRole="button"
        accessibilityLabel={WATCH_TOGETHER.hub.dismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Text style={styles.dismiss}>{WATCH_TOGETHER.hub.dismiss}</Text>
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  card: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.lg,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  open: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { fontFamily: fontFamily.display, fontSize: fontSize.md, color: colors.textPrimary },
  pill: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: colors.accentFill,
    color: colors.onAccentFill,
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  body: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary },
  note: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
  dismiss: { fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textSecondary },
});
