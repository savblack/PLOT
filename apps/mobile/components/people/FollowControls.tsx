import { useEffect, useRef, useState } from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Svg, { Line, Path, Polyline } from 'react-native-svg';
import { on, PERSON_FOLLOWED_EVENT } from '@plot/core/events.js';
import { PEOPLE as P } from '@plot/core/copy/people.js';
import { fontFamily, fontSize, profileUrl, radii, spacing } from '../../lib/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { tabBarBottom, TAB_BAR_HEIGHT } from '../../lib/tabBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FollowTarget } from './useFollowPerson';

function PlusIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round">
      <Line x1="12" y1="5" x2="12" y2="19" />
      <Line x1="5" y1="12" x2="19" y2="12" />
    </Svg>
  );
}

function TickIcon({ color }: { color: string }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

export function PersonFace({ name, path, size }: { name: string; path?: string | null; size: number }) {
  const { colors } = useTheme();
  const uri = profileUrl(path, size > 64 ? 'h632' : 'w185');
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSunken }} />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surfaceSunken, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: size > 48 ? fontSize.lg : fontSize.sm, color: colors.textPrimary }}>{name.charAt(0)}</Text>
    </View>
  );
}

export function FollowPill({ following, busy, name, onPress }: {
  following: boolean;
  busy: boolean;
  name: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityState={{ selected: following, disabled: busy }}
      accessibilityLabel={following ? P.followingLabel(name) : P.followLabel(name)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.xs,
        minHeight: 36,
        paddingHorizontal: spacing.md,
        borderRadius: radii.pill,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.bg,
        opacity: busy ? 0.45 : 1,
      }}
    >
      {following ? <TickIcon color={colors.accent} /> : <PlusIcon color={colors.textPrimary} />}
      <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary }}>
        {following ? P.following : P.follow}
      </Text>
    </TouchableOpacity>
  );
}

export function CastFollowCard({ person, following, busy, showFollow, onOpen, onToggle }: {
  person: FollowTarget & { character?: string; roles?: { character?: string }[] };
  following: boolean;
  busy: boolean;
  showFollow: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  const role = person.character || person.roles?.[0]?.character;
  return (
    <View style={{ width: 84 }}>
      <View>
        <TouchableOpacity onPress={onOpen} accessibilityRole="button" accessibilityLabel={P.viewLabel(person.name)}>
          <PersonFace name={person.name} path={person.profile_path} size={72} />
        </TouchableOpacity>
        {showFollow && (
          <TouchableOpacity
            onPress={onToggle}
            disabled={busy}
            accessibilityRole="button"
            accessibilityState={{ selected: following }}
            accessibilityLabel={following ? P.followingLabel(person.name) : P.followLabel(person.name)}
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: colors.surfaceSunken,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: colors.bg,
            }}
          >
            {following ? <TickIcon color={colors.accent} /> : <PlusIcon color={colors.textPrimary} />}
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity onPress={onOpen} accessibilityRole="button" accessibilityLabel={P.viewLabel(person.name)}>
        <Text style={{ marginTop: spacing.xs, fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, color: colors.textPrimary }} numberOfLines={2}>{person.name}</Text>
        {!!role && <Text style={{ fontFamily: fontFamily.sans, fontSize: 10, color: colors.textMuted }} numberOfLines={2}>{role}</Text>}
      </TouchableOpacity>
    </View>
  );
}

export function CrewFollowRow({ person, roleLabel, following, busy, showFollow, onOpen, onToggle }: {
  person: FollowTarget;
  roleLabel: string;
  following: boolean;
  busy: boolean;
  showFollow: boolean;
  onOpen: () => void;
  onToggle: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      <TouchableOpacity onPress={onOpen} accessibilityRole="button" accessibilityLabel={P.viewLabel(person.name)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <PersonFace name={person.name} path={person.profile_path} size={44} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.sm, color: colors.textPrimary }} numberOfLines={1}>{person.name}</Text>
          <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted }}>{roleLabel}</Text>
        </View>
      </TouchableOpacity>
      {showFollow && (
        <FollowPill following={following} busy={busy} name={person.name} onPress={onToggle} />
      )}
    </View>
  );
}

interface FollowToast {
  name: string;
  profilePath: string | null;
  upcoming: number | null;
}

export function PeopleChip({ label, tone }: { label: string; tone: 'today' | 'quiet' | 'default' }) {
  const { colors } = useTheme();
  const backgroundColor = tone === 'today'
    ? colors.accentFill
    : tone === 'quiet'
      ? colors.surfaceSunken
      : colors.accentSecondaryFill;
  const color = tone === 'today'
    ? colors.onAccentFill
    : tone === 'quiet'
      ? colors.textSecondary
      : colors.onAccentSecondaryFill;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.badge, backgroundColor }}>
      <Text style={{ fontFamily: fontFamily.sansBold, fontSize: 11, lineHeight: 16, color }}>{label}</Text>
    </View>
  );
}

export function FollowToastHost() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [toast, setToast] = useState<FollowToast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const off = on(PERSON_FOLLOWED_EVENT, (payload: FollowToast) => {
      setToast(payload);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(null), 7000);
    });
    return () => {
      off();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!toast) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: spacing.lg, right: spacing.lg, bottom: tabBarBottom(insets.bottom) + TAB_BAR_HEIGHT + spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border }}>
        <PersonFace name={toast.name} path={toast.profilePath} size={36} />
        <Text style={{ flex: 1, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary }}>{P.toast.added(toast.name, toast.upcoming)}</Text>
        <TouchableOpacity
          onPress={() => { setToast(null); router.push('/(app)/your-people' as Href); }}
          accessibilityRole="button"
          style={{ minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radii.pill, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.sm, color: colors.textPrimary }}>{P.toast.view}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setToast(null)} accessibilityRole="button" accessibilityLabel={P.toast.dismiss} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.textMuted} strokeWidth={2} strokeLinecap="round">
            <Path d="M18 6 6 18M6 6l12 12" />
          </Svg>
        </TouchableOpacity>
      </View>
    </View>
  );
}
