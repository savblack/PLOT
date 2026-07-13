import {
  View, Text, TouchableOpacity, Animated, Dimensions,
  StyleSheet, Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useRef, useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';

const DRAWER_W = Dimensions.get('window').width * 0.58;

const NAV_ITEMS = [
  { id: 'index',    label: 'Discover', path: '/(app)/'         },
  { id: 'guide',    label: 'Guide',    path: '/(app)/guide'    },
  { id: 'calendar', label: 'Calendar', path: '/(app)/calendar' },
  { id: 'my-lists', label: 'My Lists', path: '/(app)/my-lists' },
  { id: 'history',  label: 'History',  path: '/(app)/history'  },
];

const BOTTOM_NAV_ITEMS = [
  { id: 'settings', label: 'Settings', path: '/(app)/settings' },
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
  const { profile } = useAppData();
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

  const activeId = pathname === '/' || pathname === '/(app)' || pathname === '/(app)/'
    ? 'index'
    : pathname.split('/').pop() ?? '';

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
          <Text style={styles.wordmark}>PLOT</Text>

          {/* Main nav */}
          <View style={styles.nav}>
            {NAV_ITEMS.map(item => {
              const active = activeId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(item.path)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Spacer */}
          <View style={{ flex: 1 }} />

          {/* Bottom-pinned nav */}
          <View style={[styles.nav, styles.navBottom]}>
            {profile?.username && (
              <TouchableOpacity
                style={styles.navItem}
                onPress={() => navigate(`/(app)/u/${profile.username}`)}
                activeOpacity={0.7}
              >
                <Text style={styles.navLabel}>My Profile</Text>
              </TouchableOpacity>
            )}
            {BOTTOM_NAV_ITEMS.map(item => {
              const active = activeId === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.navItem, active && styles.navItemActive]}
                  onPress={() => navigate(item.path)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
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

  wordmark: {
    fontFamily: fontFamily.serif,
    fontSize: 28,
    color: colors.textPrimary,
    letterSpacing: 0,
    textTransform: 'uppercase',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.xl,
  },

  nav: {
    gap: 2,
    paddingHorizontal: spacing.md,
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
  },
  navItemActive: {
    backgroundColor: colors.accentDim,
  },

  navLabel: {
    fontFamily: fontFamily.sansMedium,
    fontSize: fontSize.md,
    color: colors.textSecondary,
  },
  navLabelActive: {
    color: colors.accent,

  },
});
