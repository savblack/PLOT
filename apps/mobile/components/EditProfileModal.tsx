/**
 * Edit profile sheet — the RN counterpart of web's EditProfileModal in
 * PublicProfilePage.jsx.
 *
 * Mobile previously had no edit surface at all: the "Edit" affordance on a
 * user's own profile pushed them to Settings, which edits a different set of
 * things entirely. Display name, username, bio and links were web-only.
 *
 * Field set, validation and save semantics are web's, and the two now read the
 * link/section definitions from @plot/core/profileFields.js so a platform can't
 * quietly grow a field the other doesn't know about.
 *
 * NOT included: changing the avatar photo. That lives in Settings' Account
 * group (lib/avatar.ts), as it does on web, not in this sheet.
 */
import { useState, useEffect, useMemo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import PageSheet from './PageSheet';
import { Spinner } from './Loader';
import { TextInput } from './TextInput';
import { IconCheck } from './icons';
import { Avatar } from './Avatar';
import { supabase } from '../lib/supabase';
import { useTheme } from '../contexts/ThemeContext';
import { useAppData } from '../contexts/AppDataContext';
import { favoriteWords } from '../lib/spelling';
import { Palette, fontFamily, fontSize, spacing, radii } from '../lib/tokens';
import { PUBLIC_PROFILE_PAGE } from '@plot/core/copy/publicProfilePage.js';
import { PROFILE_PRIVACY } from '@plot/core/copy/profilePrivacy.js';
import {
  SOCIAL_LINKS, PROFILE_SECTIONS, ALL_SECTION_KEYS, USERNAME_RE, normaliseUsername,
  isDuplicateUsernameError,
} from '@plot/core/profileFields.js';
import { updateProfile } from '@plot/core/profile.js';

type Status = '' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function EditProfileModal({
  userId, current, onClose, onSaved,
}: {
  userId: string;
  current: any;
  onClose: () => void;
  onSaved: (patch: any) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  // Region lives on the viewer's own profile row; the public-profile shape
  // this sheet is handed doesn't carry it, which spelled this "Favorites"
  // while My Lists said "Favourites" two taps away.
  const { profile: viewerProfile } = useAppData();
  const fw = favoriteWords(viewerProfile?.region);

  const [displayName, setDisplayName] = useState(current.display_name || '');
  const [bio, setBio]                 = useState(current.bio || '');
  const [links, setLinks]             = useState<Record<string, string>>(current.links || {});
  const [uname, setUname]             = useState(current.username || '');
  const [enabled, setEnabled]         = useState<string[]>(current.profile_sections ?? ALL_SECTION_KEYS);
  const [unameStatus, setUnameStatus] = useState<Status>('');
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');

  const cleanUname   = normaliseUsername(uname);
  const unameChanged = cleanUname !== normaliseUsername(current.username);
  const validUname   = USERNAME_RE.test(cleanUname);

  useEffect(() => {
    if (!unameChanged) { setUnameStatus(''); return; }
    if (!validUname)   { setUnameStatus('invalid'); return; }
    setUnameStatus('checking');
    const t = setTimeout(async () => {
      const { data, error: e } = await supabase.rpc('username_available', { p_username: cleanUname });
      setUnameStatus(e ? '' : data ? 'ok' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [cleanUname, unameChanged, validUname]);

  const canSave = !saving && (unameStatus === '' || unameStatus === 'ok') && (!unameChanged || validUname);

  const toggleSection = (key: string) =>
    setEnabled(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  const save = async () => {
    setSaving(true); setError('');
    // Trim, then drop empties — an empty string would render as a live link to
    // nowhere. Same normalisation web does before writing.
    const cleanLinks = Object.fromEntries(
      Object.entries(links).map(([k, v]) => [k, String(v ?? '').trim()]).filter(([, v]) => v)
    );
    const patch: Record<string, any> = {
      display_name: displayName.trim() || null,
      bio: bio.trim() || null,
      links: Object.keys(cleanLinks).length ? cleanLinks : null,
    };
    if (unameChanged) patch.username = cleanUname;

    const { error: e } = await updateProfile({ userId, patch });
    if (e) {
      setSaving(false);
      setError(isDuplicateUsernameError(e) ? PUBLIC_PROFILE_PAGE.usernameTaken : PUBLIC_PROFILE_PAGE.saveFailed);
      return;
    }

    // Section visibility is a separate best-effort write, as on web, so the
    // core save still succeeds if the profile_sections column isn't there yet.
    const sections = ALL_SECTION_KEYS.filter(k => enabled.includes(k));
    await updateProfile({ userId, patch: { profile_sections: sections } });

    setSaving(false);
    onSaved({ ...patch, username: unameChanged ? cleanUname : current.username, profile_sections: sections });
  };

  const unameHint =
    unameStatus === 'checking' ? 'Checking…'
    : unameStatus === 'taken'  ? PUBLIC_PROFILE_PAGE.usernameTaken
    : unameStatus === 'invalid' ? PUBLIC_PROFILE_PAGE.usernameRule
    : unameStatus === 'ok'      ? 'Available.'
    : '';

  return (
    <PageSheet
      title={PUBLIC_PROFILE_PAGE.editProfile}
      onClose={onClose}
      onSave={save}
      canSave={canSave}
      saving={saving}
      error={error || null}
    >
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {/* Photo is display-only for now: picking one needs expo-image-picker,
                a native module, so it can't ship without a dev-client rebuild. */}
            <View style={styles.photoRow}>
              <Avatar url={current.avatar_url} name={displayName || uname} size={72} colors={colors} />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={PUBLIC_PROFILE_PAGE.namePlaceholder}
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Username</Text>
              <View style={styles.unameRow}>
                <Text style={styles.at}>@</Text>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={uname}
                  onChangeText={setUname}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {unameStatus === 'checking' && <Spinner />}
              </View>
              {!!unameHint && (
                <Text style={[styles.hint, unameStatus === 'ok' ? styles.hintOk : styles.hintBad]}>{unameHint}</Text>
              )}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Bio</Text>
              <TextInput
                style={[styles.input, styles.bio]}
                value={bio}
                onChangeText={setBio}
                placeholder={PUBLIC_PROFILE_PAGE.bioPlaceholder}
                placeholderTextColor={colors.textMuted}
                multiline
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Links</Text>
              {SOCIAL_LINKS.map(({ key, label, placeholder }: any) => (
                <View key={key} style={styles.linkRow}>
                  <Text style={styles.linkLabel}>{label}</Text>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={links[key] || ''}
                    onChangeText={(v) => setLinks(prev => ({ ...prev, [key]: v }))}
                    placeholder={placeholder}
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              ))}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{PROFILE_PRIVACY.sectionsHeading}</Text>
              <Text style={[styles.hint, { color: colors.textMuted, marginBottom: spacing.sm }]}>{PROFILE_PRIVACY.sectionsHelp}</Text>
              {PROFILE_SECTIONS.map(({ key, label }: any) => {
                const on = enabled.includes(key);
                return (
                  <TouchableOpacity
                    key={key}
                    style={styles.sectionRow}
                    onPress={() => toggleSection(key)}
                    activeOpacity={0.7}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                  >
                    <View style={[styles.checkbox, on && styles.checkboxOn]}>
                      {on && (
                        <IconCheck size={12} color="#fff" strokeWidth={3} />
                      )}
                    </View>
                    <Text style={styles.sectionLabel}>{key === 'favourites' ? fw.plural : label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
    </PageSheet>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  body: { padding: spacing.xl, paddingTop: spacing.xl * 1.5, gap: spacing.xl * 1.5, paddingBottom: spacing.xl * 3 },
  photoRow: { alignItems: 'center' },

  field: { gap: spacing.md },
  label: {
    fontFamily: fontFamily.sansBold, fontSize: fontSize.xs, letterSpacing: 0.9,
    textTransform: 'uppercase', color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textPrimary,
    borderWidth: 1, borderColor: colors.border,
  },
  bio: { minHeight: 90, textAlignVertical: 'top' },

  unameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  at: { fontFamily: fontFamily.sans, fontSize: fontSize.md, color: colors.textMuted },
  hint: { fontFamily: fontFamily.sans, fontSize: fontSize.xs },
  hintOk:  { color: colors.textMuted },
  hintBad: { color: colors.accent },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  linkLabel: { width: 90, fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textMuted },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
    borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  sectionLabel: { fontFamily: fontFamily.sans, fontSize: fontSize.sm, color: colors.textPrimary },
});
