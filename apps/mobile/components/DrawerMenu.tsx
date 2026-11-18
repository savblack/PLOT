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
import { THEME_FAMILIES, THEME_MODES, isPremiumFamily, type ThemeFamily } from '@plot/core/themes.js';
import { useNotifications } from '@plot/core/useNotifications.js';
import { Palette, fontFamily, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import Svg, { Circle, Path } from 'react-native-svg';
import { IconChevronDown, IconChevronUp } from './icons';
import { Avatar } from './Avatar';
import NavGlyph, { NavIconName } from './NavIcons';
import { SHOW_WATCH_TOGETHER } from '../lib/launchFeatures';
import PlotWordmark from './PlotWordmark';
import { GoPremiumSpark, useGoPremiumLink } from './GoPremiumLink';
import PremiumMark from './PremiumMark';
import ThemeChip from './ThemeChip';
import UpgradeSheet from './UpgradeSheet';
import { useDialog } from './Dialog';
import { signOutOfPlot } from '../lib/signOut';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';
import { guideInMenu } from '@plot/core/broadcastGuide.js';

// Web's drawer is min(300px, 85vw). The old 58% width was sized for bare labels.
const DRAWER_W = Math.min(300, Dimensions.get('window').width * 0.85);

// Guide shows only where the region has listings (core guideInMenu, as web).
// Same order as the web phone drawer, with Search kept at the top because
// the desktop rail leads with it. Settings stays pinned. Watch together is
// included while SHOW_WATCH_TOGETHER is on. Follow requests live in Settings.
const NAV_ITEMS: { id: string; label: string; path: string; icon: NavIconName; premium?: boolean }[] = [
  { id: 'search',   label: APP_SHELL.search,       path: '/(app)/search',   icon: 'search' },
  { id: 'index',    label: 'Home',                  path: '/(app)/',         icon: 'home' },
  { id: 'new-releases', label: titleForView('new-releases'), path: '/(app)/new-releases', icon: 'new-releases' },
  { id: 'calendar', label: 'Calendar',              path: '/(app)/calendar', icon: 'calendar' },
  { id: 'my-lists', label: 'My Lists',              path: '/(app)/my-lists', icon: 'lists' },
  { id: 'history',  label: titleForView('history'), path: '/(app)/history',  icon: 'history' },
  { id: 'guide',    label: titleForView('guide'),   path: '/(app)/guide',    icon: 'guide' },
  { id: 'tonight',  label: titleForView('tonight'), path: '/(app)/tonight',  icon: 'tonight', premium: true },
  ...(SHOW_WATCH_TOGETHER ? [{ id: 'together', label: titleForView('together'), path: '/(app)/together', icon: 'together' as const, premium: true }] : []),
  { id: 'compare',  label: titleForView('compare'), path: '/(app)/compare',  icon: 'compare', premium: true },
];


const KOFI_URL = 'https://ko-fi.com/J7P123TYGK';

const A = SETTINGS_VIEW.appearance;
// Web's note beside Mode says "This browser". The phone stores the choice on
// the device, so the wording is the phone's own and stays out of the catalog.
const THIS_DEVICE = 'This device';

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
  const { colors, mode, family, setMode, setFamily } = useTheme();
  const { profile, userId } = useAppData();
  const { confirm, notify, dialog } = useDialog();
  const premium = !!profile?.is_premium;
  const { unread } = useNotifications(userId);
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [menuOpen, setMenuOpen] = useState(false);
  // The Premium family a Free viewer tapped: opens the upgrade sheet for it.
  const [themeUpgrade, setThemeUpgrade] = useState<ThemeFamily | null>(null);
  // The pink Go Premium chip above the profile; read only while the drawer is open.
  const goPremium = useGoPremiumLink(userId, profile, visible, 'chip');
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

  // A family the viewer cannot use never applies: the upgrade sheet opens
  // instead, as on web and in Settings.
  const pickTheme = (id: ThemeFamily) => {
    if (!setFamily(id)) setThemeUpgrade(id);
  };

  const signOut = async () => {
    if (await signOutOfPlot({ userId, confirm, notify })) onClose();
  };

  // Rendered in both the open and closed trees, so a sheet opened from the
  // menu survives the drawer closing behind it.
  const sheets = (
    <>
      <UpgradeSheet
        visible={!!themeUpgrade}
        reason="themes"
        family={themeUpgrade ?? undefined}
        onClose={() => setThemeUpgrade(null)}
        onCompare={() => navigate(PREMIUM_SETTINGS_PATH)}
      />
      {dialog}
    </>
  );

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

  // One row of the account menu. Web's rows carry no selected state, so
  // neither do these; the profile row under the menu shows where you are.
  const menuRow = ({ key, label, icon, link, onPress }: {
    key?: string; label: string; icon: NavIconName | 'profile'; link?: boolean; onPress: () => void;
  }) => (
    <TouchableOpacity
      key={key}
      style={styles.menuItem}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole={link ? 'link' : 'button'}
      accessibilityLabel={label}
    >
      {icon === 'profile' ? (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.textSecondary} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <Circle cx={12} cy={8} r={4} />
          <Path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
        </Svg>
      ) : (
        <NavGlyph name={icon} color={colors.textSecondary} />
      )}
      <Text style={styles.menuLabel} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );

  // Don't block touches when fully closed
  if (!visible) {
    return (
      <>
      <Animated.View
        style={[styles.root, { opacity: overlayO }]}
        pointerEvents="none"
      >
        <Animated.View style={[styles.drawer, { transform: [{ translateX: slideX }] }]}>
          </Animated.View>
      </Animated.View>
      {sheets}
      </>
    );
  }

  return (
    <>
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
            {NAV_ITEMS.filter(item => item.id !== 'guide' || guideInMenu(profile?.region)).map(item => {
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
                    <PremiumMark style={styles.premiumMark} />
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

          {/* Foot, as in the web rail: the profile row opens the account menu,
              laid out as web's AccountMenu.jsx is. Top to bottom: Light / Dark /
              System, a chip per theme family, the account links, Help build
              Plot, then Sign out. */}
          <View style={styles.foot}>
            {menuOpen && (
              <View style={styles.menu}>
                <View style={styles.appearance}>
                  <View style={styles.menuHead}>
                    <Text style={styles.menuTitle}>{A.switcher.mode}</Text>
                    <Text style={styles.menuNote}>{THIS_DEVICE}</Text>
                  </View>
                  <View style={styles.modes} accessibilityRole="radiogroup" accessibilityLabel={`${A.switcher.mode}, ${THIS_DEVICE}`}>
                    {THEME_MODES.map(m => (
                      <TouchableOpacity
                        key={m}
                        style={[styles.modeButton, mode === m && styles.modeButtonActive]}
                        onPress={() => setMode(m)}
                        activeOpacity={0.7}
                        accessibilityRole="radio"
                        accessibilityState={{ checked: mode === m }}
                      >
                        <Text style={[styles.modeText, mode === m && styles.modeTextActive]} numberOfLines={1}>{A.modes[m]}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.menuHead}>
                    <Text style={styles.menuTitle}>{A.themesLabel}</Text>
                    <Text style={styles.menuNote} numberOfLines={1}>{A.switcher.current(A.families[family as keyof typeof A.families], isPremiumFamily(family))}</Text>
                  </View>
                  <View style={styles.swatches} accessibilityRole="radiogroup" accessibilityLabel={A.themesOptionsLabel}>
                    {THEME_FAMILIES.map(id => {
                      const name = A.families[id as keyof typeof A.families];
                      const locked = isPremiumFamily(id) && !premium;
                      return (
                        <TouchableOpacity
                          key={id}
                          onPress={() => pickTheme(id)}
                          activeOpacity={0.7}
                          hitSlop={4}
                          accessibilityRole="radio"
                          accessibilityState={{ checked: family === id }}
                          accessibilityLabel={locked ? A.lockedTheme(name) : name}
                        >
                          <ThemeChip family={id} selected={family === id} />
                          {locked && <PremiumMark size={11} style={styles.swatchLock} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.menuSection}>
                  {profile?.username && (menuRow({ label: APP_SHELL.viewYourProfile, icon: 'profile', onPress: () => navigate(`/(app)/u/${profile.username}`) }))}
                  {BOTTOM_NAV_ITEMS.map(item => (menuRow({ key: item.id, label: item.label, icon: item.icon, onPress: () => navigate(item.path) })))}
                </View>

                <View style={styles.menuSection}>
                  <Text style={styles.helpTitle}>{APP_SHELL.helpBuild}</Text>
                  {menuRow({ label: APP_SHELL.giveFeedback, icon: 'feedback', onPress: () => openFeedback('general') })}
                  {menuRow({ label: SETTINGS_VIEW.support.supportPlot, icon: 'support', link: true, onPress: openSupport })}
                </View>

                <View style={styles.menuSection}>
                  <TouchableOpacity
                    style={styles.menuItem}
                    onPress={() => { void signOut(); }}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={SETTINGS_VIEW.signOut}
                  >
                    <Text style={[styles.menuLabel, styles.signOut]}>{SETTINGS_VIEW.signOut}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {goPremium && (
              <TouchableOpacity
                style={[styles.navItem, styles.goPremiumChip]}
                onPress={() => { goPremium.tap('side_nav'); navigate(PREMIUM_SETTINGS_PATH); }}
                activeOpacity={0.8}
                accessibilityRole="link"
                accessibilityLabel={goPremium.label}
              >
                <GoPremiumSpark color={colors.accentText} size={18} />
                <Text style={[styles.navLabel, styles.goPremiumChipLabel]} numberOfLines={1}>{goPremium.label}</Text>
              </TouchableOpacity>
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
                {menuOpen
                  ? <IconChevronUp size={16} color={colors.textSecondary} />
                  : <IconChevronDown size={16} color={colors.textSecondary} />}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>
    </Animated.View>
    {sheets}
    </>
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
    borderRadius: radii.pill,
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
  // The account menu, sized and spaced as web's .account-menu-panel. Rows are
  // 40pt tall where web's are 36px, for a finger.
  menu: {
    marginBottom: spacing.sm,
    padding: 6,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  appearance: { gap: 9, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12 },
  menuHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  menuTitle: { fontFamily: fontFamily.sansBold, fontSize: 12.8, color: colors.textPrimary },
  menuNote: { flexShrink: 1, fontFamily: fontFamily.sans, fontSize: 11.2, color: colors.textMuted },
  modes: {
    flexDirection: 'row',
    marginBottom: 5,
    padding: 3,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  modeButton: { flex: 1, height: 30, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { backgroundColor: colors.surface },
  modeText: { fontFamily: fontFamily.sansBold, fontSize: 11.5, color: colors.textSecondary },
  modeTextActive: { color: colors.textPrimary },
  swatches: { flexDirection: 'row', justifyContent: 'space-between' },
  // The Premium spark on a family a Free viewer cannot pick yet.
  swatchLock: {
    position: 'absolute',
    right: -3,
    bottom: -3,
    padding: 1,
    borderRadius: 999,
    backgroundColor: colors.surfaceRaised,
  },
  menuSection: {
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  helpTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 10.9,
    color: colors.textMuted,
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 2,
  },
  menuItem: {
    minHeight: 40,
    padding: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  menuLabel: {
    flexShrink: 1,
    fontFamily: fontFamily.sansMedium,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  // Sign out is the menu's one accent: logout is an approved accent action.
  signOut: { color: colors.accentText },
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
  // Unread count on the Notifications row.
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
  // Premium marker for Free viewers: web's PremiumMark, a small solid spark.
  premiumMark: { marginLeft: 'auto' },
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
  // One full nav row (navItem's width, height, padding and icon column),
  // coloured like web's selected "Profile & account" Settings pill: the
  // accentDim blush with accentText type and star. Says only "Go Premium".
  goPremiumChip: { backgroundColor: colors.accentDim, marginBottom: 6 },
  goPremiumChipLabel: { fontFamily: fontFamily.sansBold, color: colors.accentText },
});
