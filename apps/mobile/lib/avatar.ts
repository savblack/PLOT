// RN side of the profile photo: pick (with the system square crop), upload to
// the avatars bucket, point the profile at it. Mirrors AvatarSetting in
// apps/web/src/components/SettingsView.jsx: the same `${userId}/avatar.jpg`
// path, the same cache-busted public URL, the same 5MB limit from core.
// Returns a message (from the shared copy) on failure and null on success or
// when the person backs out of the picker.
import * as ImagePicker from 'expo-image-picker';
import { updateProfile } from '@plot/core/profile.js';
import { validateAvatarFile } from '@plot/core/profileFields.js';
import { SETTINGS_VIEW } from '@plot/core/copy/settingsView.js';
import { supabase } from './supabase';

const A = SETTINGS_VIEW.avatar;

export async function pickAndUploadAvatar(userId: string): Promise<{ changed: boolean; error: string | null }> {
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.85,
  });
  if (picked.canceled || !picked.assets?.[0]) return { changed: false, error: null };
  const asset = picked.assets[0];

  const check = validateAvatarFile({ type: asset.mimeType ?? 'image/jpeg', size: asset.fileSize });
  if (!check.ok) {
    return { changed: false, error: check.reason === 'too-large' ? A.tooLarge(check.maxMb) : A.chooseImageFile };
  }

  try {
    const body = await (await fetch(asset.uri)).arrayBuffer();
    const path = `${userId}/avatar.jpg`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, body, { upsert: true, contentType: 'image/jpeg', cacheControl: '31536000' });
    if (upErr) return { changed: false, error: upErr.message || A.uploadFailed };

    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    // Cache-bust so a replaced photo at the same path refreshes immediately.
    const { error: dbErr } = await updateProfile({ userId, patch: { avatar_url: `${data.publicUrl}?v=${Date.now()}` } });
    if (dbErr) return { changed: false, error: dbErr.message || A.saveFailed };
    return { changed: true, error: null };
  } catch {
    return { changed: false, error: A.uploadFailed };
  }
}

export async function removeAvatar(userId: string): Promise<{ changed: boolean; error: string | null }> {
  // Best-effort cleanup of any stored object for this user (extension may vary).
  const { data: files } = await supabase.storage.from('avatars').list(userId);
  if (files?.length) {
    await supabase.storage.from('avatars').remove(files.map((f: { name: string }) => `${userId}/${f.name}`));
  }
  const { error } = await updateProfile({ userId, patch: { avatar_url: null } });
  return error ? { changed: false, error: error.message || A.removeFailed } : { changed: true, error: null };
}
