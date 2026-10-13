import {
  View, Text, TouchableOpacity, Animated, Dimensions,
  StyleSheet, Pressable, Linking, ScrollView,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRef, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { titleForView } from '@plot/core/navigation.js';
import { useNotifications } from '@plot/core/useNotifications.js';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { Avatar } from './Avatar';
import NavGlyph, { NavIconName } from './NavIcons';
import { SHOW_KOFI_LINK, SHOW_WATCH_TOGETHER } from '../lib/launchFeatures';

// Web's drawer is min(300px, 85vw). The old 58% width was sized for bare labels.
const DRAWER_W = Math.min(300, Dimensions.get('window').width * 0.85);

// Same order as the web phone drawer, with Search kept at the top because
// the desktop rail leads with it. Settings stays pinned. Watch together
// stays out while its launch flag is off. Follow requests live in Settings.
const NAV_ITEMS: { id: string; label: string; path: string; icon: NavIconName; premium?: boolean }[] = [
  { id: 'search',   label: APP_SHELL.search,       path: '/(app)/search',   icon: 'search' },
  { id: 'index',    label: 'Home',                  path: '/(app)/',         icon: 'home' },
  { id: 'calendar', label: 'Calendar',              path: '/(app)/calendar', icon: 'calendar' },
  { id: 'my-lists', label: 'My Lists',              path: '/(app)/my-lists', icon: 'lists' },
  { id: 'history',  label: titleForView('history'), path: '/(app)/history',  icon: 'history' },
  { id: 'guide',    label: titleForView('guide'),   path: '/(app)/guide',    icon: 'guide' },
  { id: 'tonight',  label: titleForView('tonight'), path: '/(app)/tonight',  icon: 'tonight', premium: true },
  ...(SHOW_WATCH_TOGETHER ? [{ id: 'together', label: titleForView('together'), path: '/(app)/together', icon: 'together' as const, premium: true }] : []),
];

const FEEDBACK_ITEMS = [
  { type: 'bug',     label: SETTINGS_VIEW.feedback.bugReportLabel },
  { type: 'feature', label: SETTINGS_VIEW.feedback.featureRequestLabel },
  { type: 'general', label: SETTINGS_VIEW.feedback.generalFeedbackLabel },
];

const KOFI_URL = 'https://ko-fi.com/J7P123TYGK';

const BOTTOM_NAV_ITEMS: { id: string; label: string; path: string; icon: NavIconName }[] = [
  { id: 'settings', label: 'Settings', path: '/(app)/settings', icon: 'settings' },
];

interface DrawerMenuProps {
  visible: boolean;
  onClose: () => void;
}

export default function DrawerMenu({ visible, onClose }: DrawerMenuProps) {
  const insets   = useSafeAreaInsets();
  const router   = useRouter();
  const pathname = usePathname();
  const { colors, resolved } = useTheme();
  const { profile, userId } = useAppData();
  const { unread } = useNotifications(userId);
  const styles = useMemo(() => makeStyles(colors, resolved === 'dark'), [colors, resolved]);

  const slideX   = useRef(new Animated.Value(-DRAWER_W)).current;
  const overlayO = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
        Animated.timing(overlayO, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideX, { toValue: -DRAWER_W, duration: 220, useNativeDriver: true }),
        Animated.timing(overlayO, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const navigate = (path: string) => {
    onClose();
    setTimeout(() => router.push(path as any), 50);
  };

  const openFeedback = (type: string) =>
    navigate(`/(app)/settings?feedback=${type}`);

  const openSupport = () => {
    onClose();
    void Linking.openURL(KOFI_URL).catch(() => {});
  };

  const pathParts = pathname.split('?')[0].split('/').filter(Boolean);
  const segment = pathParts[pathParts.length - 1] ?? '';
  const onHome = pathname === '/' || pathname === '/(app)' || pathname === '/(app)/';
  const isActive = (id: string) => {
    if (id === 'index') return onHome;
    // Together is a stack, so /together/pick should still light the row.
    if (id === 'together') return pathname.startsWith('/together');
    return segment === id;
  };
  const profileActive = segment === 'profile'
    || (!!profile?.username && pathParts[0] === 'u' && pathParts[1] === profile.username);

  // Don't block touches when fully closed
  if (!visible) {
    return (
      <Animated.View
        style={[styles.root, { opacity: overlayO }]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideX }] }]}>
          <BlurView intensity={72} tint={resolved} style={[StyleSheet.absoluteFill, styles.blurBackground]} />
        </Animated.View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.root, { opacity: overlayO }]} pointerEvents="box-none">
      {/* Dimmed overlay — tap to close */}
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* Drawer panel */}
      <Animated.View
        style={[styles.drawer, { transform: [{ translateX: slideX }] }]}
      >
        <BlurView intensity={72} tint={resolved} style={[StyleSheet.absoluteFill, styles.blurBackground]} />

        <View style={[styles.content, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.brandRow}>
            <Text style={styles.wordmark}>plot</Text>
            <Text style={styles.beta} accessibilityLabel={APP_SHELL.beta}>{APP_SHELL.beta}</Text>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Main nav */}
          <View style={styles.nav}>
            {NAV_ITEMS.map(item => {
              const active = isActive(item.id);
              const color = active ? colors.accent : colors.textSecondary;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(item.path)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                >
                  <NavGlyph name={item.icon} color={color} />
                  <Text style={[styles.navLabel, { color }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.premium && !profile?.is_premium && (
                    <Text style={styles.premiumPill}>{APP_SHELL.premium}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
            {profile?.username && (
              <TouchableOpacity
                style={[styles.navItem, profileActive && styles.navItemActive]}
                onPress={() => navigate(`/(app)/u/${profile.username}`)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: profileActive }}
                accessibilityLabel={APP_SHELL.profile}
              >
                <Avatar
                  url={profile.avatar_url}
                  name={profile.display_name || profile.username}
                  size={18}
                  colors={colors}
                />
                <Text style={[styles.navLabel, profileActive && { color: colors.accent }]}>{APP_SHELL.profile}</Text>
              </TouchableOpacity>
            )}
            {userId && (
              <TouchableOpacity
                style={[styles.navItem, isActive('notifications') && styles.navItemActive]}
                onPress={() => navigate('/(app)/notifications')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive('notifications') }}
                accessibilityLabel={unread > 0 ? `${APP_SHELL.notifications}, ${unread} unread` : APP_SHELL.notifications}
              >
                <NavGlyph name="notifications" color={isActive('notifications') ? colors.accent : colors.textSecondary} />
                <Text style={[styles.navLabel, isActive('notifications') && { color: colors.accent }]}>{APP_SHELL.notifications}</Text>
                {unread > 0 && <Text style={styles.badge}>{unread > 9 ? '9+' : unread}</Text>}
              </TouchableOpacity>
            )}
          </View>

          <View style={[styles.nav, styles.help]}>
            <Text style={styles.helpTitle}>{APP_SHELL.helpBuild}</Text>
            {FEEDBACK_ITEMS.map(item => (
              <TouchableOpacity
                key={item.type}
                style={styles.navItem}
                onPress={() => openFeedback(item.type)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={item.label}
              >
                <NavGlyph name="feedback" color={colors.textSecondary} />
                <Text style={styles.navLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
            {SHOW_KOFI_LINK && (
              <TouchableOpacity
                style={styles.navItem}
                onPress={openSupport}
                activeOpacity={0.7}
                accessibilityRole="link"
                accessibilityLabel={SETTINGS_VIEW.support.supportPlot}
              >
                <NavGlyph name="support" color={colors.textSecondary} />
                <Text style={styles.navLabel}>{SETTINGS_VIEW.support.supportPlot}</Text>
              </TouchableOpacity>
            )}
          </View>
          </ScrollView>

          {/* Bottom-pinned nav. Web's phone drawer pins Settings the same way. */}
          <View style={[styles.nav, styles.navBottom]}>
            {BOTTOM_NAV_ITEMS.map(item => {
              const active = isActive(item.id);
              const color = active ? colors.accent : colors.textSecondary;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(item.path)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                >
                  <NavGlyph name={item.icon} color={color} />
                  <Text style={[styles.navLabel, { color }]} numberOfLines={1}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette, dark: boolean) => StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
    backgroundColor: 'rgba(0,0,0,0.25)',
  },

  drawer: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_W,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },

  blurBackground: {
    // Matches the web glass tokens: rgba(255,255,255,0.82) / rgba(25,25,25,0.85)
    backgroundColor: dark ? 'rgba(25,25,25,0.72)' : 'rgba(250,250,252,0.65)',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
  },

  content: { flex: 1 },
  scroll: { flex: 1 },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },
  wordmark: {
    fontFamily: fontFamily.display,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: -1,
  },
  beta: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.accentSecondaryFill,
    color: colors.onAccentSecondaryFill,
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  nav: {
    gap: 2,
    paddingHorizontal: spacing.md,
  },
  help: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  helpTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textMuted,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xs,
  },
  navBottom: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },

  navItem: {
    paddingHorizontal: spacing.md,
    paddingVertical: 13,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  // Premium marker for Free viewers: the Beta pill's shape in the pink fill.
  badge: {
    marginLeft: 'auto',
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: colors.accent,
    color: colors.onAccentFill,
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    lineHeight: 18,
    textAlign: 'center',
  },
  premiumPill: {
    marginLeft: 'auto',
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
  navItemActive: {
    backgroundColor: colors.accentDim,
  },

  navLabel: {
    flexShrink: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
});
