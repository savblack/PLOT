// Mobile customize sheet. The groups and save rules live in @plot/core.
import { useEffect, useMemo, useState } from 'react';
import {
  Image, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { loadArtworkCatalog } from '@plot/core/artwork.js';
import { ARTWORK } from '@plot/core/copy/artwork.js';
import { COMMON } from '@plot/core/copy/common.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { isPremiumProfile } from '@plot/core/premium.js';
import { useUserArtwork } from '@plot/core/useUserArtwork.js';
import { useAppData } from '../contexts/AppDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { tmdb } from '../lib/tmdb';
import BottomSheet from './BottomSheet';
import { TextLink } from './Button';
import { useDialog } from './Dialog';
import Loader from './Loader';
import { PREMIUM_SETTINGS_PATH } from '../lib/premium';
import { backdropUrl, fontFamily, fontSize, logoUrl, Palette, posterUrl, profileUrl, radii, spacing } from '../lib/tokens';

type ArtworkKind = 'poster' | 'backdrop' | 'logo' | 'profile';

type Section = {
  key: string;
  labelKey: string;
  subjectType: string;
  tmdbId: number;
  seasonNumber: number;
  kind: ArtworkKind;
  options: { file_path: string }[];
};

function tileUrl(kind: ArtworkKind, path?: string | null) {
  if (!path) return null;
  if (kind === 'backdrop') return backdropUrl(path, 'w300');
  if (kind === 'logo') return logoUrl(path, 'w300');
  if (kind === 'profile') return profileUrl(path, 'w185');
  return posterUrl(path, 'w185');
}

function sectionTitle(section: Section) {
  if (section.labelKey === 'seasonPosters') return ARTWORK.seasonPosters(section.seasonNumber);
  if (section.labelKey === 'backdrops') return ARTWORK.backdrops;
  if (section.labelKey === 'logos') return ARTWORK.logos;
  if (section.labelKey === 'photos') return ARTWORK.photos;
  return ARTWORK.posters;
}

function fallbackPath(section: Section, defaults: { poster?: string | null; backdrop?: string | null; profile?: string | null }) {
  if (section.kind === 'profile') return defaults.profile || null;
  if (section.kind === 'backdrop') return defaults.backdrop || null;
  if (section.kind === 'logo') return null;
  return defaults.poster || null;
}

export default function CustomizeArtwork({
  mediaType,
  tmdbId,
  seasonNumber,
  defaults = {},
  onLeave,
  inline = false,
}: {
  mediaType: 'movie' | 'tv' | 'person';
  tmdbId?: number | null;
  seasonNumber?: number;
  defaults?: { poster?: string | null; backdrop?: string | null; profile?: string | null };
  onLeave?: () => void;
  /** Sit on the title kicker row instead of under the genres. */
  inline?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { userId, profile } = useAppData();
  const art = useUserArtwork();
  const [open, setOpen] = useState(false);
  const { confirm, dialog } = useDialog();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !tmdbId) return undefined;
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    loadArtworkCatalog(tmdb, { mediaType, tmdbId, seasonNumber }).then(result => {
      if (cancelled) return;
      setSections(result.sections as Section[]);
      setFailed(result.failed);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open, mediaType, tmdbId, seasonNumber]);

  if (!userId || !tmdbId) return null;

  const choose = async (section: Section, filePath: string | null) => {
    if (busy) return;
    setBusy(true);
    const choice = {
      subjectType: section.subjectType,
      tmdbId: section.tmdbId,
      seasonNumber: section.seasonNumber,
      kind: section.kind,
    };
    if (filePath) await art.save({ ...choice, filePath });
    else await art.clear(choice);
    setBusy(false);
  };

  return (
    <>
      <TextLink
        quiet
        label={ARTWORK.customize}
        onPress={async () => {
          if (!isPremiumProfile(profile)) {
            if (await confirm({ title: ARTWORK.premiumTitle, message: ARTWORK.premiumBody, confirmLabel: SETTINGS_VIEW.premium.upgradeButton, cancelLabel: COMMON.cancel })) {
              onLeave?.();
              router.push(PREMIUM_SETTINGS_PATH as Href);
            }
            return;
          }
          setOpen(true);
        }}
        style={[styles.link, inline && styles.linkInline]}
      />
      <BottomSheet visible={open} onClose={() => setOpen(false)} title={ARTWORK.customize} maxHeight="82%">
            {art.error ? <Text style={styles.note} accessibilityRole="alert">{art.error}</Text> : null}
            {loading ? <Loader /> : failed ? (
              <Text style={styles.note} accessibilityRole="alert">{ARTWORK.couldNotLoad}</Text>
            ) : (
              <>
                {sections.map(section => {
                  const saved = art.path(section.subjectType, section.tmdbId, section.kind, section.seasonNumber);
                  const fallback = fallbackPath(section, defaults);
                  const wide = section.kind === 'backdrop' || section.kind === 'logo';
                  const title = sectionTitle(section);
                  return (
                    <View key={section.key} style={styles.section} accessibilityLabel={title}>
                      <Text style={styles.sectionTitle}>{title}</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
                        <Tile
                          styles={styles}
                          wide={wide}
                          logo={section.kind === 'logo'}
                          selected={!saved}
                          label={ARTWORK.useDefault}
                          uri={tileUrl(section.kind, fallback)}
                          disabled={busy}
                          onPress={() => { void choose(section, null); }}
                        />
                        {section.options.map(option => (
                          <Tile
                            key={option.file_path}
                            styles={styles}
                            wide={wide}
                            logo={section.kind === 'logo'}
                            selected={saved === option.file_path}
                            uri={tileUrl(section.kind, option.file_path)}
                            disabled={busy}
                            onPress={() => { void choose(section, option.file_path); }}
                          />
                        ))}
                      </ScrollView>
                      {section.options.length === 0 ? <Text style={styles.empty}>{ARTWORK.empty}</Text> : null}
                    </View>
                  );
                })}
              </>
            )}
      </BottomSheet>
      {dialog}
    </>
  );
}

function Tile({
  styles, wide, logo, selected, label, uri, disabled, onPress,
}: {
  styles: ReturnType<typeof makeStyles>;
  wide: boolean;
  logo: boolean;
  selected: boolean;
  label?: string;
  uri?: string | null;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={label}
      style={[styles.tile, wide && styles.tileWide, selected && styles.tileSelected]}
    >
      {uri
        ? <Image source={{ uri }} style={[styles.image, wide && styles.imageWide, logo && styles.imageLogo]} resizeMode={logo ? 'contain' : 'cover'} />
        : <View style={[styles.image, wide && styles.imageWide]} />}
      {label ? <Text style={styles.tileLabel}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  link: { alignSelf: 'flex-start', marginTop: spacing.sm },
  linkInline: { alignSelf: 'center', marginTop: 0, marginLeft: 'auto' },
  note: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.danger },
  section: { marginBottom: spacing.xs },
  sectionTitle: {
    fontFamily: fontFamily.sansBold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  row: { gap: spacing.sm },
  tile: {
    width: 86,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
    overflow: 'hidden',
  },
  tileWide: { width: 148 },
  tileSelected: { borderColor: colors.accent },
  image: { width: '100%', height: 129, backgroundColor: colors.surfaceSunken },
  imageWide: { height: 84 },
  imageLogo: { backgroundColor: colors.surface },
  tileLabel: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    fontFamily: fontFamily.sans,
    fontSize: 11,
    color: colors.textSecondary,
  },
  empty: { marginTop: spacing.xs, fontFamily: fontFamily.sans, fontSize: fontSize.xs, color: colors.textMuted },
});
