import { Tabs } from 'expo-router';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Svg, { Path, Rect, Line, Polyline, Circle } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';
import { useAppData } from '../../contexts/AppDataContext';
import { Avatar } from '../../components/Avatar';
import { spacing } from '../../lib/tokens';
import { TAB_BAR_HEIGHT, tabBarBottom } from '../../lib/tabBar';

function IconHome({ color }: { color: string | any }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <Polyline points="9,22 9,12 15,12 15,22" />
    </Svg>
  );
}

function IconCalendar({ color }: { color: any }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={4} width={18} height={18} rx={2} ry={2} />
      <Line x1={16} y1={2} x2={16} y2={6} />
      <Line x1={8} y1={2} x2={8} y2={6} />
      <Line x1={3} y1={10} x2={21} y2={10} />
    </Svg>
  );
}

function IconLists({ color }: { color: any }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </Svg>
  );
}

function IconHistory({ color }: { color: any }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <Path d="M3 3v5h5" />
      <Path d="M12 7v5l4 2" />
    </Svg>
  );
}

function IconSettings({ color }: { color: any }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function IconProfile({ profile, focused, colors }: { profile: any; focused: boolean; colors: any }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <View style={{
        width: 26, height: 26, borderRadius: 13, overflow: 'hidden',
        borderWidth: 1.5,
        borderColor: focused ? colors.accent : colors.textMuted,
      }}>
        <Avatar
          url={profile?.avatar_url}
          name={profile?.display_name || profile?.username}
          size={23}
          colors={colors}
        />
      </View>
    </View>
  );
}

function TabBarBackground() {
  const { colors, resolved } = useTheme();
  return (
    <BlurView
      intensity={80}
      tint={resolved}
      style={[StyleSheet.absoluteFill, {
        borderRadius: TAB_BAR_HEIGHT / 2,
        overflow: 'hidden',
        backgroundColor: resolved === 'dark' ? 'rgba(25,25,25,0.55)' : 'rgba(244,244,245,0.55)',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      }]}
    />
  );
}

function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { profile } = useAppData();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Floating glass pill — detached from the edges, content scrolls
        // behind it (screens clear it via TAB_BAR_CLEARANCE).
        tabBarStyle: {
          position: 'absolute',
          marginHorizontal: spacing.xl,
          bottom: tabBarBottom(insets.bottom),
          height: TAB_BAR_HEIGHT,
          borderRadius: TAB_BAR_HEIGHT / 2,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
        },
        tabBarItemStyle: {
          height: TAB_BAR_HEIGHT,
          paddingTop: 0,
          paddingBottom: 0,
        },
        tabBarIconStyle: {
          flex: 1,
        },
        tabBarBackground: () => <TabBarBackground />,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ tabBarIcon: ({ color }) => <IconHome color={color} /> }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ tabBarIcon: ({ color }) => <IconCalendar color={color} /> }}
      />
      <Tabs.Screen
        name="my-lists"
        options={{ tabBarIcon: ({ color }) => <IconLists color={color} /> }}
      />
      {/* Profile is the 4th tab, after My Lists — the position web renders it
          in (AppShell puts it last in .tab-bar). Falls back to a hidden route
          until the profile has loaded and has a username to link to. */}
      <Tabs.Screen
        name="profile"
        options={{
          // No explicit `href` — a static route provides its own, and passing
          // one as a string makes the tab item lay out ~16pt above the others.
          tabBarIcon: ({ focused }) => <IconProfile profile={profile} focused={focused} colors={colors} />,
        }}
      />
      <Tabs.Screen name="u/[username]" options={{ href: null }} />
      <Tabs.Screen name="history"  options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="search"   options={{ href: null }} />
      <Tabs.Screen name="requests" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppLayout() {
  return <TabsLayout />;
}

