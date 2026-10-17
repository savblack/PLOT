import {
  View, Text, TouchableOpacity, Animated, Dimensions,
  StyleSheet, Pressable, Linking, ScrollView,
} from 'react-native';
import { useRef, useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { APP_SHELL } from '@plot/core/copy/appShell.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { titleForView } from '@plot/core/navigation.js';
import { useNotifications } from '@plot/core/useNotifications.js';
import { Palette, fontFamily, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import Svg, { Circle, Path, Polyline } from 'react-native-svg';
import { Avatar } from './Avatar';
import NavGlyph, { NavIconName } from './NavIcons';
import { SHOW_WATCH_TOGETHER } from '../lib/launchFeatures';
import PlotWordmark from './PlotWordmark';

// Web's drawer is min(300px, 85vw). The old 58% width was sized for bare labels.
const DRAWER_W = Math.min(300, Dimensions.get('window').width * 0.85);

// Same order as the web phone drawer, with Search kept at the top because
// the desktop rail leads with it. Settings stays pinned. Watch together is
// included while SHOW_WATCH_TOGETHER is on. Follow requests live in Settings.
const NAV_ITEMS: { id: string; label: string; path: string; icon: NavIconName; premium?: boolean }[] = [
  { id: 'search',   label: APP_SHELL.search,       path: '/(app)/search',   icon: 'search' },
  { id: 'index',    label: 'Home',                  path: '/(app)/',         icon: 'home' },
  { id: 'calendar', label: 'Calendar',              path: '/(app)/calendar', icon: 'calendar' },
  { id: 'my-lists', label: 'My Lists',              path: '/(app)/my-lists', icon: 'lists' },
  { id: 'history',  label: titleForView('history'), path: '/(app)/history',  icon: 'history' },
  { id: 'guide',    label: titleForView('guide'),   path: '/(app)/guide',    icon: 'guide' },
  { id: 'new-releases', label: titleForView('new-releases'), path: '/(app)/new-releases', icon: 'calendar' },
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
  const { colors } = useTheme();
  const { profile, userId } = useAppData();
  const { unread } = useNotifications(userId);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [menuOpen, setMenuOpen] = useState(false);
  const slideX   = useRef(new Animated.Value(-DRAWER_W)).current;
  const overlayO = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideX, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }),
        Animated.timing(overlayO, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      setMenuOpen(false);
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

  const menuRow = ({ key, label, icon, active, link, onPress }: {
    key?: string; label: string; icon: NavIconName | 'profile'; active?: boolean; link?: boolean; onPress: () => void;
  }) => {
    const color = active ? colors.textPrimary : colors.textSecondary;
    return (
      <TouchableOpacity
        key={key}
        style={[styles.navItem, active && styles.navItemActive]}
        onPress={onPress}
        activeOpacity={0.7}
        accessibilityRole={link ? 'link' : 'button'}
        accessibilityState={{ selected: !!active }}
        accessibilityLabel={label}
      >
        {icon === 'profile' ? (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={8} r={4} />
            <Path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
          </Svg>
        ) : (
          <NavGlyph name={icon} color={color} />
        )}
        <Text style={[styles.navLabel, { color }, active && styles.navLabelActive]} numberOfLines={1}>{label}</Text>
      </TouchableOpacity>
    );
  };

  // Don't block touches when fully closed
  if (!visible) {
    return (
      <Animated.View
        style={[styles.root, { opacity: overlayO }]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideX }] }]}>
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
        <View style={[styles.content, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.brandRow}>
            <PlotWordmark size={37} color={colors.textPrimary} />
            <Text style={styles.beta} accessibilityLabel={APP_SHELL.beta}>{APP_SHELL.beta}</Text>
          </View>

          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Main nav */}
          <View style={styles.nav}>
            {NAV_ITEMS.map(item => {
              const active = isActive(item.id);
              const color = active ? colors.textPrimary : colors.textSecondary;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, active && styles.navItemActive, item.id === 'search' && styles.navItemSearch]}
                  onPress={() => navigate(item.path)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={item.label}
                >
                  <NavGlyph name={item.icon} color={color} />
                  <Text style={[styles.navLabel, { color }, active && styles.navLabelActive]} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {item.premium && !profile?.is_premium && (
                    <Text style={styles.premiumPill}>{APP_SHELL.premium}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
            {userId && (
              <TouchableOpacity
                style={[styles.navItem, isActive('notifications') && styles.navItemActive]}
                onPress={() => navigate('/(app)/notifications')}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive('notifications') }}
                accessibilityLabel={unread > 0 ? `${APP_SHELL.notifications}, ${unread} unread` : APP_SHELL.notifications}
              >
                <NavGlyph name="notifications" color={isActive('notifications') ? colors.textPrimary : colors.textSecondary} />
                <Text style={[styles.navLabel, isActive('notifications') && styles.navLabelActive]}>{APP_SHELL.notifications}</Text>
                {unread > 0 && <Text style={styles.badge}>{unread > 9 ? '9+' : unread}</Text>}
              </TouchableOpacity>
            )}
          </View>

          </ScrollView>

          {/* Foot, as in the web rail: the profile row opens the account menu.
              Settings and Help build Plot live in it, as they do on web. */}
          <View style={styles.foot}>
            {menuOpen && (
              <View style={styles.menu}>
                {profile?.username && (menuRow({ label: APP_SHELL.profile, icon: 'profile', active: profileActive, onPress: () => navigate(`/(app)/u/${profile.username}`) }))}
                {BOTTOM_NAV_ITEMS.map(item => (menuRow({ key: item.id, label: item.label, icon: item.icon, active: isActive(item.id), onPress: () => navigate(item.path) })))}
                <View style={styles.menuDivider} />
                <Text style={styles.helpTitle}>{APP_SHELL.helpBuild}</Text>
                {FEEDBACK_ITEMS.map(item => (menuRow({ key: item.type, label: item.label, icon: 'feedback', onPress: () => openFeedback(item.type) })))}
                {menuRow({ label: SETTINGS_VIEW.support.supportPlot, icon: 'support', link: true, onPress: openSupport })}
              </View>
            )}
            {profile?.username && (
              <TouchableOpacity
                style={[styles.navItem, styles.profileRow, (menuOpen || profileActive || isActive('settings')) && styles.navItemActive]}
                onPress={() => setMenuOpen(o => !o)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ expanded: menuOpen }}
                accessibilityLabel={APP_SHELL.accountMenu}
              >
                <Avatar
                  url={profile.avatar_url}
                  name={profile.display_name || profile.username}
                  size={34}
                  colors={colors}
                />
                <View style={styles.profileCopy}>
                  <Text style={[styles.navLabel, (profileActive || isActive('settings')) && styles.navLabelActive]} numberOfLines={1}>
                    {profile.display_name || profile.username}
                  </Text>
                  <Text style={styles.profileHandle} numberOfLines={1}>@{profile.username}</Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Polyline points={menuOpen ? '6 15 12 9 18 15' : '6 9 12 15 18 9'} />
                </Svg>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
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
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 6, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 16,
  },

  content: { flex: 1 },
  scroll: { flex: 1 },

  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    height: 80,
  },
  beta: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: colors.accentSecondaryFill,
    color: colors.onAccentSecondaryFill,
    fontFamily: fontFamily.sansBold,
    fontSize: 9.6,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  nav: {
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 24,
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
  menu: {
    marginBottom: spacing.sm,
    padding: 4,
    gap: 2,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  menuDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.xs,
  },
  foot: {
    gap: 2,
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  navItem: {
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navItemSearch: { marginBottom: 10 },
  profileRow: { minHeight: 48, paddingVertical: 6 },
  profileCopy: { flex: 1, minWidth: 0, gap: 3 },
  profileHandle: {
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: colors.textSecondary,
  },
  // Premium marker for Free viewers: the Beta pill's shape in the pink fill.
  badge: {
    marginLeft: 'auto',
    minWidth: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    overflow: 'hidden',
    backgroundColor: colors.accentText,
    color: colors.surface,
    fontFamily: fontFamily.sansBold,
    fontSize: 10,
    lineHeight: 18,
    textAlign: 'center',
  },
  // Premium marker for Free viewers: web's quiet pink tint with accent text.
  premiumPill: {
    marginLeft: 'auto',
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
    backgroundColor: `${colors.accent}1A`,
    color: colors.accentText,
    fontFamily: fontFamily.sansBold,
    fontSize: 9.6,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  navItemActive: {
    backgroundColor: colors.surfaceSunken,
  },
  navLabelActive: { fontFamily: fontFamily.sansBold },

  navLabel: {
    flexShrink: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: 14.4,
    color: colors.textSecondary,
  },
});
