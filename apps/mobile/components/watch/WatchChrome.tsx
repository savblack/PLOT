import { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useMediaPanel } from '../../contexts/MediaPanelContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconChevronRight } from '../icons';
import Button from '../Button';
import BackBar from '../BackBar';
import { Avatar } from '../Avatar';
import { personName } from '@plot/core/watchTogether.js';
import { posterUrl, fontFamily, fontSize, spacing, radii } from '../../lib/tokens';
import { TAB_BAR_CLEARANCE } from '../../lib/tabBar';
import { PREMIUM_SETTINGS_PATH } from '../../lib/premium';
import { useTheme } from '../../contexts/ThemeContext';
import { WtPerson } from './watchModel';
import PlotWordmark from '../PlotWordmark';

export function PosterThumb({ path, width, height }: { path: string | null; width: number; height: number }) {
  const { colors } = useTheme();
  const url = posterUrl(path, width > 140 ? 'w342' : 'w185');
  if (!url) return <View style={{ width, height, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken }} />;
  return <Image source={{ uri: url }} style={{ width, height, borderRadius: radii.sm, backgroundColor: colors.surfaceSunken }} resizeMode="cover" />;
}

/** Kept for app/(app)/notifications.tsx only; the watch screens use Button directly. */
export function PrimaryButton({ label, onPress, disabled, flex }: { label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  return <Button variant="primary" label={label} onPress={onPress} disabled={disabled} flex={flex} />;
}

export function SecondaryButton({ label, onPress, disabled, flex }: { label: string; onPress: () => void; disabled?: boolean; flex?: boolean }) {
  return <Button label={label} onPress={onPress} disabled={disabled} flex={flex} />;
}

export function openPremium(router: { push: (href: Href) => void }) {
  router.push(PREMIUM_SETTINGS_PATH as Href);
}

export function useOpenTitle() {
  const { open } = useMediaPanel();
  return (title: { tmdb_id: number; media_type: string }) => {
    open(title.tmdb_id, title.media_type === 'tv' ? 'tv' : 'movie');
  };
}

export function WatchPage({ children, backTo, hideBack, scroll = true }: { children: ReactNode; backTo?: Href; hideBack?: boolean; scroll?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const goBack = () => {
    if (backTo) router.replace(backTo);
    else if (router.canGoBack()) router.back();
    else router.replace('/(app)/together' as Href);
  };
  const body = scroll ? (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + TAB_BAR_CLEARANCE, gap: spacing.lg }}>
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, paddingHorizontal: spacing.xl, paddingBottom: insets.bottom + spacing.lg, gap: spacing.lg }}>{children}</View>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      {hideBack ? <View style={{ height: spacing.sm }} /> : <BackBar onBack={goBack} />}
      {body}
    </View>
  );
}

export function Wordmark() {
  const { colors } = useTheme();
  return <PlotWordmark size={fontSize.xl} color={colors.textPrimary} />;
}

export function ErrorNote({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text accessibilityRole="alert" style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger, lineHeight: 20 }}>{children}</Text>;
}

export function ButtonRow({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>{children}</View>;
}

export function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fontFamily.sansMedium, fontSize: fontSize.xs, letterSpacing: 0.6, color: colors.textMuted, textTransform: 'uppercase' }}>{children}</Text>;
}

export function Note({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary, lineHeight: 20 }}>{children}</Text>;
}

export function PersonRow({ person, note, onPress, trailing }: { person: WtPerson; note?: string; onPress?: () => void; trailing?: ReactNode }) {
  const { colors } = useTheme();
  const body = (
    <>
      <Avatar url={person.avatar_url} name={personName(person)} size={40} colors={colors} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: fontFamily.sansBold, fontSize: fontSize.md, color: colors.textPrimary }} numberOfLines={1}>{personName(person)}</Text>
        {!!note && <Text style={{ fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textSecondary }} numberOfLines={2}>{note}</Text>}
      </View>
      {trailing}
      {onPress && (
        <IconChevronRight size={14} color={colors.textMuted} />
      )}
    </>
  );
  if (!onPress) return <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>{body}</View>;
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm }}>
      {body}
    </TouchableOpacity>
  );
}

/** Rows grouped on one surface with hairlines between them. */
export function ListCard({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = (Array.isArray(children) ? children : [children]).filter(Boolean) as ReactNode[];
  return (
    <View style={{ backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.lg, paddingHorizontal: spacing.md }}>
      {rows.map((row, i) => (
        <View key={i} style={i ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border } : undefined}>{row}</View>
      ))}
    </View>
  );
}

